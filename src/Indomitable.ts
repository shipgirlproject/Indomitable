// @ts-ignore -- optional interface
import { Client, ClientOptions as DiscordJsClientOptions, Intents } from 'discord.js';
import { ClientOptions, ServerOptions } from 'net-ipc';
import { Chunk, Constructor, FetchSessions, LibraryEvents, SessionObject } from './Util';
import { ShardClient } from './client/ShardClient';
import { ClusterManager } from './ClusterManager';
import { Primary } from './ipc/Primary';
import EventEmitter from 'events';
import Cluster from 'cluster';
import Os from 'os';

export interface IpcOptions {
    primary?: ServerOptions;
    worker?: ClientOptions
}

export interface IndomitableOptions {
    clusterCount?: number;
    shardCount?: number|'auto';
    clientOptions?: DiscordJsClientOptions;
    ipcOptions?: IpcOptions;
    nodeArgs?: string[];
    ipcTimeout?: number;
    spawnTimeout?: number;
    spawnDelay?: number;
    retryFailed?: boolean;
    autoRestart?: boolean;
    client: typeof Client;
    token: string;
}

export class Indomitable extends EventEmitter {
    public clusterCount: number;
    public shardCount: number|'auto';
    public cachedSessionInfo?: SessionObject;
    public readonly clientOptions: DiscordJsClientOptions;
    public readonly ipcOptions: IpcOptions;
    public readonly nodeArgs: string[];
    public readonly ipcTimeout: number;
    public readonly spawnTimeout: number;
    public readonly spawnDelay: number;
    public readonly retryFailed: boolean;
    public readonly autoRestart: boolean;
    public readonly client: typeof Client;
    public readonly clusters?: Map<number, ClusterManager>;
    public readonly ipc?: Primary;
    private readonly token: string;
    constructor(options: IndomitableOptions) {
        super();
        this.clusterCount = options.clusterCount || Os.cpus().length;
        this.shardCount = options.shardCount || 'auto';
        this.clientOptions = options.clientOptions || { intents: [Intents.FLAGS.GUILDS] };
        this.ipcOptions = options.ipcOptions || {};
        this.nodeArgs = options.nodeArgs || [];
        this.ipcTimeout = options.ipcTimeout ?? 60000;
        this.spawnTimeout = options.spawnTimeout ?? 20000;
        this.spawnDelay = options.spawnDelay ?? 5000;
        this.retryFailed = options.retryFailed ?? true;
        this.autoRestart = options.autoRestart ?? false;
        this.client = options.client;
        this.token = options.token;
        if (!Cluster.isPrimary) return;
        this.clusters = new Map();
        this.ipc = new Primary(this);
        this.cachedSessionInfo = undefined;
        if (!this.autoRestart) return;
        this.on(LibraryEvents.WORKER_EXIT, (_, signal, cluster) => {
            if (signal === 'SIGKILL') return;
            cluster
                .respawn()
                .catch((error: any) => this.emit(LibraryEvents.ERROR, error));
        });
    }

    public async spawn(): Promise<void> {
        if (!Cluster.isPrimary) {
            const shardClient = new ShardClient(this);
            await shardClient.start(this.token);
            return;
        }
        await this.ipc!.server.start();
        if (typeof this.shardCount !== 'number') {
            this.cachedSessionInfo = await FetchSessions(this.token);
            this.shardCount = this.cachedSessionInfo.shards;
        }
        if (this.shardCount < this.clusterCount)
            this.clusterCount = this.shardCount;
        this.emit('debug', `Spawning ${this.shardCount} websocket shards across ${this.clusterCount} clusters`);
        const shards = [...Array(this.shardCount).keys()];
        const chunks = Chunk(shards, Math.round(this.shardCount / this.clusterCount));
        if (this.nodeArgs.length) Cluster.setupPrimary({ execArgv: this.nodeArgs });
        const failedClusters: ClusterManager[] = [];
        for (let id = 0; id < this.clusterCount; id++) {
            const chunk = chunks.shift()!;
            const cluster = new ClusterManager({ id, shards: chunk, manager: this });
            this.clusters!.set(id, cluster);
            try {
                this.emit('debug', `Starting Cluster ${cluster.id} containing Shard(s) [${cluster.shards.join(', ')}]`);
                await cluster.spawn();
                this.emit('debug', `Succesfully spawned Cluster ${cluster.id} containing Shard(s) [${cluster.shards.join(', ')}]`);
            } catch (error) {
                this.emit(LibraryEvents.ERROR, error);
                if (this.retryFailed) {
                    this.emit('debug', `Failed to spawn Cluster ${cluster.id} containing Shard(s) [${cluster.shards.join(', ')}]. Requeuing...`);
                    failedClusters.push(cluster);
                }
            }
        }
        if (failedClusters.length) {
            while(failedClusters.length) {
                const cluster = failedClusters.shift()!;
                try {
                    this.emit('debug', `Re-starting Cluster ${cluster.id} containing Shard(s) [${cluster.shards.join(', ')}]`);
                    await cluster.spawn();
                    this.emit('debug', `Succesfully spawned Cluster ${cluster.id} containing Shard(s) [${cluster.shards.join(', ')}]`);
                } catch (error) {
                    this.emit(LibraryEvents.ERROR, error);
                    if (this.retryFailed) {
                        this.emit('debug', `Failed to spawn Cluster ${cluster.id} containing Shard(s) [${cluster.shards.join(', ')}]. Requeuing...`);
                        failedClusters.push(cluster);
                    }
                }
            }
        }
    }

    public async restart(clusterId: number) {
        if (!Cluster.isPrimary) return;
        const cluster = this.clusters!.get(clusterId);
        if (!cluster) throw new Error('Invalid clusterId, or a cluster with this id doesn\'t exist');
        await cluster.respawn();
    }

    public async restartAll() {
        if (!Cluster.isPrimary) return;
        this.emit('debug', `Restarting ${this.clusters!.size} clusters sequentially...`);
        for (const cluster of this.clusters!.values()) await cluster.respawn();
    }
}
