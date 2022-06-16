import type { Client, ClientOptions as DiscordJsClientOptions } from 'discord.js';
import { ClientOptions, Connection, ServerOptions } from 'net-ipc';
import { Chunk, FetchSessions, LibraryEvents, Message, SessionObject } from './Util';
import { ShardClient } from './client/ShardClient';
import { ClusterManager } from './ClusterManager';
import { Primary } from './ipc/Primary';
import EventEmitter from 'node:events';
import Cluster from 'node:cluster';
import Os from 'node:os';

/**
 * Options to control IPC behavior
 */
export interface IpcOptions {
    primary?: ServerOptions;
    worker?: ClientOptions
}

/**
 * Options to control Indomitable behavior
 */
export interface IndomitableOptions {
    clusterCount?: number|'auto';
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

export interface ShardEventData {
    clusterId: number,
    shardId?: number,
    replayed?: number,
    event?: CloseEvent
}

export declare interface Indomitable {
    /**
     * Emitted when data useful for debugging is produced
     * @eventProperty
     */
    on(event: 'debug', listener: (message: string) => void): this;
    /**
     * Emmited when an IPC connection is established
     * @eventProperty
     */
    on(event: 'connect', listener: (connection: Connection, payload?: unknown) => void): this;
    /**
     * Emmited when an IPC connection is disconencted
     * @eventProperty
     */
    on(event: 'disconnect', listener: (connection: Connection, reason?: unknown) => void): this;
    /**
     * Emmited when an IPC connection is closed
     * @eventProperty
     */
    on(event: 'close', listener: () => void): this;
    /**
     * Emmited when an IPC message is recieved
     * @eventProperty
     */
    on(event: 'message', listener: (message: Message) => void): this;
    /**
     * Emitted when an error occurs
     * @eventProperty
     */
    on(event: 'error', listener: (error: unknown) => void): this;
    /**
     * Emitted when a new worker process is forked
     * @eventProperty
     */
    on(event: 'workerFork', listener: (cluster: ClusterManager) => void): this;
    /**
     * Emitted when a worker process is ready
     * @eventProperty
     */
    on(event: 'workerReady', listener: (cluster: ClusterManager) => void): this;
    /**
     * Emitted when a worker process exits
     * @eventProperty
     */
    on(event: 'workerExit', listener: (code: number|null, signal: string|null, cluster: ClusterManager) => void): this;
    /**
     * Emitted when a Discord.js shard is ready
     * @eventProperty
     */
    on(event: 'shardReady', listener: (event: ShardEventData) => void): this;
    /**
     * Emitted when a Discord.js shard is reconnecting
     * @eventProperty
     */
    on(event: 'shardReconnect', listener: (event: ShardEventData) => void): this;
    /**
     * Emitted when a Discord.js shard resumes
     * @eventProperty
     */
    on(event: 'shardResume', listener: (event: ShardEventData) => void): this;
    /**
     * Emitted when a Discord.js shard disconnects
     * @eventProperty
     */
    on(event: 'shardDisconnect', listener: (event: ShardEventData) => void): this;
    once(event: 'debug', listener: (message: string) => void): this;
    once(event: 'connect', listener: (connection: Connection, payload?: unknown) => void): this;
    once(event: 'disconnect', listener: (connection: Connection, reason?: unknown) => void): this;
    once(event: 'close', listener: () => void): this;
    once(event: 'message', listener: (message: Message) => void): this;
    once(event: 'error', listener: (error: unknown) => void): this;
    once(event: 'workerFork', listener: (cluster: ClusterManager) => void): this;
    once(event: 'workerReady', listener: (cluster: ClusterManager) => void): this;
    once(event: 'workerExit', listener: (code: number|null, signal: string|null, cluster: ClusterManager) => void): this;
    once(event: 'shardReady', listener: (event: ShardEventData) => void): this;
    once(event: 'shardReconnect', listener: (event: ShardEventData) => void): this;
    once(event: 'shardResume', listener: (event: ShardEventData) => void): this;
    once(event: 'shardDisconnect', listener: (event: ShardEventData) => void): this;
    off(event: 'debug', listener: (message: string) => void): this;
    off(event: 'connect', listener: (connection: Connection, payload?: unknown) => void): this;
    off(event: 'disconnect', listener: (connection: Connection, reason?: unknown) => void): this;
    off(event: 'close', listener: () => void): this;
    off(event: 'message', listener: (message: Message) => void): this;
    off(event: 'error', listener: (error: unknown) => void): this;
    off(event: 'workerFork', listener: (cluster: ClusterManager) => void): this;
    off(event: 'workerReady', listener: (cluster: ClusterManager) => void): this;
    off(event: 'workerExit', listener: (code: number|null, signal: string|null, cluster: ClusterManager) => void): this;
    off(event: 'shardReady', listener: (event: ShardEventData) => void): this;
    off(event: 'shardReconnect', listener: (event: ShardEventData) => void): this;
    off(event: 'shardResume', listener: (event: ShardEventData) => void): this;
    off(event: 'shardDisconnect', listener: (event: ShardEventData) => void): this;
}

/**
 * The main Indomitable class, exposing all functionality.
 */
export class Indomitable extends EventEmitter {
    public clusterCount: number|'auto';
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
    /**
     * @param [options.clusterCount=auto] The amount of clusters to spawn. Expects a number or 'auto'
     * @param [options.shardCount=auto] The number of shards to create. Expects a number or 'auto'
     * @param [options.clientOptions] Options for the Discord.js client
     * @param [options.ipcOptions.primary] Options for the net-ipc server running on the primary process
     * @param [options.ipcOptions.worker] Options for the net-ipc client running on each worker process
     * @param [options.nodeArgs] An array of arguments for each child process
     * @param [options.ipcTimeout] Time to wait before reporting a failed IPC connection
     * @param [options.spawnTimeout] Time to wait before reporting a failed child process spawn
     * @param [options.spawnDelay] Time to wait before spawing another child process
     * @param [options.retryFailed] Whether to attempt to start a cluster after it has failed
     * @param [options.autoRestart] Whether to automatically restart shards that have been killed unintentionally
     * @param [options.client] A Discord.js client class or a modified Discord.js client class
     * @param options.token Discord bot token
     */
    constructor(options: IndomitableOptions) {
        super();
        this.clusterCount = options.clusterCount || 'auto';
        this.shardCount = options.shardCount || 'auto';
        this.clientOptions = options.clientOptions || { intents: [1 << 0] };
        this.ipcOptions = options.ipcOptions || {};
        this.nodeArgs = options.nodeArgs || [];
        this.ipcTimeout = options.ipcTimeout ?? 60000;
        this.spawnTimeout = options.spawnTimeout ?? 60000;
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
            if (!cluster.started || signal === 'SIGKILL') return;
            cluster
                .respawn()
                .catch((error: unknown) => this.emit(LibraryEvents.ERROR, error as Error));
        });
    }

    /**
     * Spawn a new ShardClient if this instance is a child process, or start a new cluster and IPC server if this instance is the primary process
     * @returns A promise that resolves to void
     */
    public async spawn(): Promise<void> {
        if (!Cluster.isPrimary) {
            const shardClient = new ShardClient(this);
            await shardClient.start(this.token);
            return;
        }
        await this.ipc!.server.start();
        if (typeof this.clusterCount !== 'number')
            this.clusterCount = Os.cpus().length;
        if (typeof this.shardCount !== 'number') {
            this.cachedSessionInfo = await FetchSessions(this.token);
            this.shardCount = this.cachedSessionInfo.shards;
        }
        if (this.shardCount < this.clusterCount)
            this.clusterCount = this.shardCount;
        this.emit(LibraryEvents.DEBUG, `Starting ${this.shardCount} websocket shards across ${this.clusterCount} clusters`);
        const shards = [...Array(this.shardCount).keys()];
        const chunks = Chunk(shards, Math.round(this.shardCount / this.clusterCount));
        if (this.nodeArgs.length) Cluster.setupPrimary({ execArgv: this.nodeArgs });
        const failedClusters: ClusterManager[] = [];
        for (let id = 0; id < this.clusterCount; id++) {
            const chunk = chunks.shift()!;
            const cluster = new ClusterManager({ id, shards: chunk, manager: this });
            this.clusters!.set(id, cluster);
            try {
                await cluster.spawn();
            } catch (error: unknown) {
                this.emit(LibraryEvents.ERROR, error as Error);
                if (this.retryFailed) {
                    this.emit(LibraryEvents.DEBUG, `Failed to spawn Cluster ${cluster.id} containing Shard(s) => [ ${cluster.shards.join(', ')} ]. Requeuing...`);
                    failedClusters.push(cluster);
                }
            }
        }
        if (failedClusters.length) {
            while(failedClusters.length) {
                const cluster = failedClusters.shift()!;
                try {
                    await cluster.spawn();
                } catch (error: unknown) {
                    this.emit(LibraryEvents.ERROR, error as Error);
                    if (this.retryFailed) {
                        this.emit(LibraryEvents.DEBUG, `Failed to spawn Cluster ${cluster.id} containing Shard(s) => [ ${cluster.shards.join(', ')} ]. Requeuing...`);
                        failedClusters.push(cluster);
                    }
                }
            }
        }
    }

    /**
     * Restart specified cluster if this instance is the primary process
     * @param clusterId ID of cluster to restart
     * @returns void
     */
    public async restart(clusterId: number) {
        if (!Cluster.isPrimary) return;
        const cluster = this.clusters!.get(clusterId);
        if (!cluster) throw new Error('Invalid clusterId, or a cluster with this id doesn\'t exist');
        await cluster.respawn();
    }

    /**
     * Restart all clusters if this instance is the primary process
     * @returns void
     */
    public async restartAll() {
        if (!Cluster.isPrimary) return;
        this.emit(LibraryEvents.DEBUG, `Restarting ${this.clusters!.size} clusters sequentially...`);
        for (const cluster of this.clusters!.values()) await cluster.respawn();
    }
}
