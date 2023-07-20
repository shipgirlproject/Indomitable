import type { Client, ClientOptions as DiscordJsClientOptions } from 'discord.js';
import { WorkerShardingStrategy } from '@discordjs/ws';
import { Indomitable } from '../Indomitable';
import { EnvProcessData, ClientEvents, InternalEvents, LibraryEvents } from '../Util';
import { ConcurrencyClient } from '../concurrency/ConcurrencyClient.js';
import { ShardClientUtil } from './ShardClientUtil';
import { BaseWorker } from "../ipc/BaseWorker";

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
        // a very kek way of injecting custom options, due to backward compatibility,
        // d.js didn't provide a way to access the ws options of @discordjs/ws package
        if (manager.handleConcurrency) {
            if (!clientOptions.ws) clientOptions.ws = {};
            const concurrencyClient = new ConcurrencyClient(new BaseWorker(manager));
            // default to worker sharding strategy if this is enabled, no choice due to lack of option in d.js
            clientOptions.ws.buildStrategy = websocketManager => {
                websocketManager.options.buildIdentifyThrottler = () => Promise.resolve(concurrencyClient);
                return new WorkerShardingStrategy(websocketManager, { shardsPerWorker: Math.floor(clientOptions.shardCount! / 2) });
            };
        }
        this.client = new manager.client(clientOptions);
        // @ts-expect-error: Override shard client util with indomitable shard client util
        this.client.shard = new ShardClientUtil(client, manager);
        this.clusterId = Number(EnvProcessData.clusterId);
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
