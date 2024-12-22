import type { Client, ClientOptions as DiscordJsClientOptions } from 'discord.js';
import { Indomitable } from '../Indomitable';
import {EnvProcessData, ClientEvents, ClientEventData, Delay} from '../Util';
import { ShardClientUtil } from './ShardClientUtil';
import { ConcurrencyClient } from '../concurrency/ConcurrencyClient';

export interface PartialInternalEvents {
    op: ClientEvents,
    data: { clusterId: number, shardId?: number, replayed?: number, event?: CloseEvent, ipcId?: string }
}

/**
 * A little helper on binding Indomitable to Discord.JS client
 */
export class ShardClient {
    /**
     * Indomitable instance (non master client)
     * @private
     */
    private readonly manager: Indomitable;
    /**
     * Discord.JS client
     * @private
     */
    private readonly client: Client;
    /**
     * Cluster Id of this helper
     * @private
     */
    private readonly clusterId: number;
    /**
     * Concurrency client for this instance, if available
     * @private
     */
    private readonly concurrency?: ConcurrencyClient;

    public constructor(manager: Indomitable) {
        this.manager = manager;
        const clientOptions = manager.clientOptions as DiscordJsClientOptions || {};
        clientOptions.shards = EnvProcessData.shardIds;
        clientOptions.shardCount = EnvProcessData.shardCount;
        if (manager.handleConcurrency) {
            this.concurrency = new ConcurrencyClient();
            if (!clientOptions.ws) clientOptions.ws = {};
            clientOptions.ws.buildIdentifyThrottler = () => Promise.resolve(this.concurrency!);
        }   
        this.client = new manager.client(clientOptions);
        // @ts-expect-error: Override shard client util with indomitable shard client util
        this.client.shard = new ShardClientUtil(this.client, manager);
        this.clusterId = Number(EnvProcessData.clusterId);
    }

    /**
     * Starts this client
     * @param token
     */
    public async start(token: string): Promise<void> {
        if (this.concurrency) {
            // tests the server if it's accessible first before starting the client
            this.client.emit('debug', '[Indomitable]: Handle concurrency enabled! Testing the identify server before logging in...');
            await this.concurrency.waitForIdentify(0, new AbortSignal())
            this.client.emit('debug', '[Indomitable]: Identify server responded and is working, waiting 5s before starting...');
            await Delay(5000);
        }
        // attach listeners 
        this.client.once('ready', () => this.send({ op: ClientEvents.READY, data: { clusterId: this.clusterId }}));
        this.client.on('shardReady', (shardId: number) => this.send({ op: ClientEvents.SHARD_READY, data: { clusterId: this.clusterId, shardId }}));
        this.client.on('shardReconnecting', (shardId: number) => this.send({ op: ClientEvents.SHARD_RECONNECT, data: { clusterId: this.clusterId, shardId }}));
        this.client.on('shardResume', (shardId: number, replayed: number) => this.send({ op: ClientEvents.SHARD_RESUME, data: { clusterId: this.clusterId, shardId, replayed }}));
        // @ts-ignore -- Discord.JS faulty typings?
        this.client.on('shardDisconnect', (event: CloseEvent, shardId: number) => this.send({ op: ClientEvents.SHARD_DISCONNECT, data: { clusterId: this.clusterId, shardId, event }}));
        await this.client.login(token);
    }

    /**
     * A helper send code to make myself less miserable
     * @param partial
     * @private
     */
    private send(partial: PartialInternalEvents): void {
        // @ts-ignore -- our own class
        const shardClientUtil = this.client.shard as ShardClientUtil;
        const content: ClientEventData = { ...partial, internal: true };
        shardClientUtil
            .send({ content, repliable: false })
            .catch((error: unknown) => this.client.emit(ClientEvents.ERROR, error as Error));
    }
}
