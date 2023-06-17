import type { Client, ClientOptions as DiscordJsClientOptions } from 'discord.js';
import { WebSocketManager, SimpleShardingStrategy, IShardingStrategy } from '@discordjs/ws';
import { Indomitable } from '../Indomitable';
import { ClientEvents, InternalEvents, LibraryEvents } from '../Util';
import { ConcurrencyClient } from '../concurrency/ConcurrencyClient.js';
import { ShardClientUtil } from './ShardClientUtil';

export interface PartialInternalEvents {
    op: ClientEvents,
    data: { clusterId: number, shardId?: number, replayed?: number, event?: CloseEvent, ipcId?: string }
}

export class ShardClient {
    public readonly client: Client;
    public readonly clusterId: number;
    public constructor(public manager: Indomitable) {
        const clientOptions = manager.clientOptions as DiscordJsClientOptions || {};
        clientOptions.shards = process.env.INDOMITABLE_SHARDS!.split(' ').map(Number);
        clientOptions.shardCount = Number(process.env.INDOMITABLE_SHARDS_TOTAL);
        // a very kekw way of injecting custom options, due to backward compatibility,
        // d.js didn't provide a way to access the ws options of @discordjs/ws package
        if (manager.handleConcurrency) {
            if (!clientOptions.ws) clientOptions.ws = {};
            if (!clientOptions.ws.buildStrategy) {
                clientOptions.ws.buildStrategy = manager => {
                    const strategy = new SimpleShardingStrategy(manager);
                    manager.options.buildIdentifyThrottler = () => {
                        const manager = new ConcurrencyClient(client.shard as unknown as ShardClientUtil);
                        return Promise.resolve(manager);
                    };
                    return strategy;
                };
            } else {
                // eslint-disable-next-line no-new-func
                const clone = Function(clientOptions.ws.buildStrategy.toString()) as unknown as (manager: WebSocketManager) => IShardingStrategy ;
                clientOptions.ws.buildStrategy = manager => {
                    const strategy = clone(manager);
                    manager.options.buildIdentifyThrottler = () => {
                        const manager = new ConcurrencyClient(client.shard as unknown as ShardClientUtil);
                        return Promise.resolve(manager);
                    };
                    return strategy;
                };
            }
        }
        const client = new manager.client(clientOptions);
        // @ts-ignore -- our own class
        client.shard = new ShardClientUtil(manager, client);
        this.client = client;
        this.clusterId = Number(process.env.INDOMITABLE_CLUSTER);
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
