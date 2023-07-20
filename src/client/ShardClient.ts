import type { Client, ClientOptions as DiscordJsClientOptions } from 'discord.js';
import { Indomitable } from '../Indomitable';
import { EnvProcessData, ClientEvents, InternalEvents, LibraryEvents } from '../Util';
import { ConcurrencyClient } from '../concurrency/ConcurrencyClient.js';
import { ShardClientUtil } from './ShardClientUtil';
import { BaseWorker } from '../ipc/BaseWorker';

export interface PartialInternalEvents {
    op: ClientEvents,
    data: { clusterId: number, shardId?: number, replayed?: number, event?: CloseEvent, ipcId?: string }
}

export class ShardClient {
    public readonly manager: Indomitable;
    public readonly client: Client;
    public readonly clusterId: number;
    public constructor(manager: Indomitable) {
        this.manager = manager;
        const clientOptions = manager.clientOptions as DiscordJsClientOptions || {};
        clientOptions.shards = EnvProcessData.shardIds;
        clientOptions.shardCount = EnvProcessData.shardCount;
        this.client = new manager.client(clientOptions);
        // @ts-expect-error: Override shard client util with indomitable shard client util
        this.client.shard = new ShardClientUtil(this.client, manager);
        this.clusterId = Number(EnvProcessData.clusterId);
        // pseudo code for the meantime until discord.js merges https://github.com/discordjs/discord.js/pull/9728
        if (manager.handleConcurrency) {
            const concurrencyClient = new ConcurrencyClient(new BaseWorker(manager));
            // @ts-expect-error: Private function variable of @discordjs/ws manager
            if (this.client.ws._ws) {
                // @ts-expect-error: Override build identify throttler
                this.client.ws._ws.options.buildIdentifyThrottler = () => Promise.resolve(concurrencyClient);
            }
        }
    }

    public async start(token: string): Promise<void> {
        // attach listeners
        this.client.once('ready', () => this.send({ op: ClientEvents.READY, data: { clusterId: this.clusterId }}));
        this.client.on('shardReady', (shardId: number) => this.send({ op: ClientEvents.SHARD_READY, data: { clusterId: this.clusterId, shardId }}));
        this.client.on('shardReconnecting', (shardId: number) => this.send({ op: ClientEvents.SHARD_RECONNECT, data: { clusterId: this.clusterId, shardId }}));
        this.client.on('shardResume', (shardId: number, replayed: number) => this.send({ op: ClientEvents.SHARD_RESUME, data: { clusterId: this.clusterId, shardId, replayed }}));
        // @ts-ignore -- Discord.JS faulty typings?
        this.client.on('shardDisconnect', (event: CloseEvent, shardId: number) => this.send({ op: ClientEvents.SHARD_DISCONNECT, data: { clusterId: this.clusterId, shardId, event }}));
        await this.client.login(token);
    }

    private send(partial: PartialInternalEvents): void {
        // @ts-ignore -- our own class
        const shardClientUtil = this.client.shard as ShardClientUtil;
        const content: InternalEvents = { ...partial, internal: true };
        shardClientUtil
            .send({ content, repliable: false })
            .catch((error: unknown) => this.client.emit(LibraryEvents.ERROR, error as Error));
    }
}
