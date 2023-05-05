import type { Client, ClientOptions as DiscordJsClientOptions  } from 'discord.js';
import type { WebSocketManager } from '@discordjs/ws';
import { Indomitable } from '../Indomitable';
import { ClientEvents, InternalEvents, LibraryEvents } from '../Util';
import { ShardClientUtil } from './ShardClientUtil';
import { ConcurrencyClient } from '../concurrency/ConcurrencyClient.js';

export interface PartialInternalEvents {
    op: ClientEvents,
    data: { clusterId: number, shardId?: number, replayed?: number, event?: CloseEvent, ipcId?: string }
}

export class ShardClient {
    public readonly client: Client;
    public readonly clusterId: number;
    constructor(public manager: Indomitable) {
        const env = process.env;
        const clientOptions = manager.clientOptions as DiscordJsClientOptions || {};
        clientOptions.shards = env.SHARDS!.split(' ').map(Number);
        clientOptions.shardCount = Number(env.SHARDS_TOTAL);
        const client = new manager.client(clientOptions);
        // @ts-ignore -- our own class
        client.shard = new ShardClientUtil(manager, client);
        this.client = client;
        this.clusterId = Number(process.env.CLUSTER);
        if (!manager.handleConcurrency) return;
        this.ws.options.buildIdentifyThrottler = () => {
            const manager = new ConcurrencyClient(client.shard as unknown as ShardClientUtil);
            return Promise.resolve(manager);
        };
    }

    get ws(): WebSocketManager {
        // @ts-expect-error: access internal ws class to modify options
        return this.client.ws._ws;
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
