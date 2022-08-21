import type { Client, ClientOptions as DiscordJsClientOptions } from 'discord.js';
import { Chunk, FetchSessions, LibraryEvents, Message, SessionObject } from './Util';
import { ShardClient } from './client/ShardClient';
import { MainUtil as PrimaryIpc } from './ipc/MainUtil';
import { ClusterManager } from './ClusterManager';
import Cluster, { ClusterSettings } from 'node:cluster';
import EventEmitter from 'node:events';
import Os from 'node:os';

/**
 * Options to control Indomitable behavior
 */
export interface IndomitableOptions {
    clusterCount?: number|'auto';
    shardCount?: number|'auto';
    clientOptions?: DiscordJsClientOptions;
    clusterSettings?: ClusterSettings;
    ipcTimeout?: number;
    spawnTimeout?: number;
    spawnDelay?: number;
    autoRestart?: boolean;
    waitForReady?: boolean;
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
     * Emmited when an IPC message is recieved
     * @eventProperty
     */
    on(event: 'message', listener: (message: Message|unknown) => void): this;
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
    once(event: 'message', listener: (message: Message|unknown) => void): this;
    once(event: 'error', listener: (error: unknown) => void): this;
    once(event: 'workerFork', listener: (cluster: ClusterManager) => void): this;
    once(event: 'workerReady', listener: (cluster: ClusterManager) => void): this;
    once(event: 'workerExit', listener: (code: number|null, signal: string|null, cluster: ClusterManager) => void): this;
    once(event: 'shardReady', listener: (event: ShardEventData) => void): this;
    once(event: 'shardReconnect', listener: (event: ShardEventData) => void): this;
    once(event: 'shardResume', listener: (event: ShardEventData) => void): this;
    once(event: 'shardDisconnect', listener: (event: ShardEventData) => void): this;
    off(event: 'debug', listener: (message: string) => void): this;
    off(event: 'message', listener: (message: Message|unknown) => void): this;
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
    public cachedSession?: SessionObject;
    public readonly clientOptions: DiscordJsClientOptions;
    public readonly clusterSettings: ClusterSettings;
    public readonly ipcTimeout: number;
    public readonly spawnTimeout: number;
    public readonly spawnDelay: number;
    public readonly autoRestart: boolean;
    public readonly waitForReady: boolean;
    public readonly client: typeof Client;
    public readonly clusters?: Map<number, ClusterManager>;
    public readonly ipc?: PrimaryIpc;
    private readonly spawnQueue?: ClusterManager[];
    private readonly token: string;
    private busy?: boolean;
    /**
     * @param [options.clusterCount=auto] The amount of clusters to spawn. Expects a number or 'auto'
     * @param [options.shardCount=auto] The number of shards to create. Expects a number or 'auto'
     * @param [options.clientOptions] Options for the Discord.js client
     * @param [options.clusterSettings] Options for the forked process
     * @param [options.ipcTimeout] Time to wait before reporting a failed IPC connection
     * @param [options.spawnTimeout] Time to wait before reporting a failed child process spawn
     * @param [options.spawnDelay] Time to wait before spawing another child process
     * @param [options.autoRestart] Whether to automatically restart shards that have been killed unintentionally
     * @param [options.waitForReady] Whether to wait for clusters to be ready before spawning a new one
     * @param [options.client] A Discord.js client class or a modified Discord.js client class
     * @param options.token Discord bot token
     */
    constructor(options: IndomitableOptions) {
        super();
        this.clusterCount = options.clusterCount || 'auto';
        this.shardCount = options.shardCount || 'auto';
        this.clientOptions = options.clientOptions || { intents: [1 << 0] };
        this.clusterSettings = options.clusterSettings || {};
        this.ipcTimeout = options.ipcTimeout ?? 30000;
        this.spawnTimeout = options.spawnTimeout ?? 60000;
        this.spawnDelay = options.spawnDelay ?? 5000;
        this.autoRestart = options.autoRestart ?? false;
        this.waitForReady = options.waitForReady ?? true;
        this.client = options.client;
        this.token = options.token;
        if (!Cluster.isPrimary) return;
        this.clusters = new Map();
        this.ipc = new PrimaryIpc(this);
        this.spawnQueue = [];
        this.busy = false;
        this.cachedSession = undefined;
    }

    /**
     * Gets how many clusters are waiting to be spawned
     * @returns Number of clusters in queue
     */
    get inSpawnQueueCount(): number {
        if (!Cluster.isPrimary) return 0;
        return this.spawnQueue!.length;
    }

    /**
     * Gets the current session info of the bot token Indomitable currently handles
     * @returns Session Info
     */
    public fetchSessions(): Promise<SessionObject> {
        return FetchSessions(this.token);
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
        if (typeof this.clusterCount !== 'number')
            this.clusterCount = Os.cpus().length;
        if (typeof this.shardCount !== 'number') {
            this.cachedSession = await this.fetchSessions();
            this.shardCount = this.cachedSession.shards;
        }
        if (this.shardCount < this.clusterCount)
            this.clusterCount = this.shardCount;
        this.emit(LibraryEvents.DEBUG, `Starting ${this.shardCount} websocket shards across ${this.clusterCount} clusters`);
        const shards = [...Array(this.shardCount).keys()];
        const chunks = Chunk(shards, Math.round(this.shardCount / this.clusterCount));
        Cluster.setupPrimary({ ...{ serialization: 'json' }, ...this.clusterSettings  });
        for (let id = 0; id < this.clusterCount; id++) {
            const chunk = chunks.shift()!;
            const cluster = new ClusterManager({ id, shards: chunk, manager: this });
            this.clusters!.set(id, cluster);
        }
        await this.addToSpawnQueue(...this.clusters!.values());
    }

    /**
     * Restart specified cluster if this instance is the primary process
     * @param clusterId Id of cluster to restart
     * @returns A promise that resolves to void
     */
    public async restart(clusterId: number): Promise<void> {
        if (!Cluster.isPrimary) return;
        const cluster = this.clusters!.get(clusterId);
        if (!cluster) throw new Error(`Invalid clusterId, or a cluster with this id doesn\'t exist, received id ${clusterId}`);
        await this.addToSpawnQueue(cluster);
    }

    /**
     * Restart all clusters if this instance is the primary process
     * @returns A promise that resolves to void
     */
    public async restartAll(): Promise<void>  {
        if (!Cluster.isPrimary) return;
        this.emit(LibraryEvents.DEBUG, `Restarting ${this.clusters!.size} clusters sequentially...`);
        await this.addToSpawnQueue(...this.clusters!.values());
    }

    /**
     * Adds a cluster to spawn queue
     * @internal
     */
    public addToSpawnQueue(...clusters: ClusterManager[]) {
        if (!Cluster.isPrimary) return;
        this.spawnQueue!.push(...clusters);
        return this.processQueue();
    }

    /**
     * Adds a cluster to spawn queue
     * @internal
     */
    private async processQueue(): Promise<void> {
        if (this.busy || !this.spawnQueue!.length) return;
        this.busy = true;
        this.emit(LibraryEvents.DEBUG, `Processing spawn queue with ${this.spawnQueue!.length} clusters waiting to be spawned....`);
        let cluster: ClusterManager;
        while (this.spawnQueue!.length > 0) {
            try {
                cluster = this.spawnQueue!.shift()!;
                if (cluster.started)
                    await cluster.respawn();
                else
                    await cluster.spawn();
            } catch (error: unknown) {
                this.emit(LibraryEvents.ERROR, error as Error);
                if (cluster! && this.autoRestart) {
                    this.emit(LibraryEvents.DEBUG, `Failed to spawn Cluster ${cluster.id} containing [ ${cluster.shards.join(', ')} ] shard(s). Requeuing...`);
                    if (!this.spawnQueue!.includes(cluster)) this.spawnQueue!.push(cluster);
                }
            }
        }
        this.busy = false;
        this.emit(LibraryEvents.DEBUG, 'Cluster Queue Empty! Clusters done booting up');
    }
}
