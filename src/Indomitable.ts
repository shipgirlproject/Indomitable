import type { Client, ClientOptions as DiscordJsClientOptions } from 'discord.js';
import Cluster, { ClusterSettings } from 'node:cluster';
import EventEmitter from 'node:events';
import Os from 'node:os';
import { clearTimeout } from 'timers';
import { ConcurrencyServer } from './concurrency/ConcurrencyServer';
import { ShardClient } from './client/ShardClient';
import { ClusterManager } from './manager/ClusterManager.js';
import {
    Chunk,
    FetchSessions,
    MakeAbortableRequest,
    AbortableData,
    InternalOps,
    InternalOpsData,
    LibraryEvents,
    Message,
    SessionObject,
    Transportable,
    Sendable
} from './Util';


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
    handleConcurrency?: boolean;
    client: typeof Client;
    token: string;
}

export interface ReconfigureOptions {
    clusters?: number;
    shards?: number;
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
     * Emitted when an IPC message is received
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
    /**
     * Emitted when a Discord.js client is ready
     * @eventProperty
     */
    on(event: 'clientReady', listener: (event: ShardEventData) => void): this;
    /**
     * Emitted on every ipc message the handler receives
     * @eventProperty
     */
    on(event: 'raw', listener: (event: unknown) => void): this;
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
    once(event: 'clientReady', listener: (event: ShardEventData) => void): this;
    once(event: 'raw', listener: (event: unknown) => void): this;
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
    off(event: 'clientReady', listener: (event: ShardEventData) => void): this;
    off(event: 'raw', listener: (event: unknown) => void): this;
}

/**
 * The main Indomitable class, exposing all functionality.
 */
export class Indomitable extends EventEmitter {
    public clusterCount: number|'auto';
    public shardCount: number|'auto';
    public cachedSession?: SessionObject;
    public concurrencyServer?: ConcurrencyServer;
    public readonly clientOptions: DiscordJsClientOptions;
    public readonly clusterSettings: ClusterSettings;
    public readonly ipcTimeout: number;
    public readonly spawnTimeout: number;
    public readonly spawnDelay: number;
    public readonly autoRestart: boolean;
    public readonly waitForReady: boolean;
    public readonly handleConcurrency: boolean;
    public readonly client: typeof Client;
    public readonly clusters: Map<number, ClusterManager>;
    private readonly spawnQueue: ClusterManager[];
    private readonly token: string;
    private busy: boolean;
    /**
     * @param [options.clusterCount=auto] The amount of clusters to spawn. Expects a number or 'auto'
     * @param [options.shardCount=auto] The number of shards to create. Expects a number or 'auto'
     * @param [options.clientOptions] Options for the Discord.js client
     * @param [options.clusterSettings] Options for the forked process
     * @param [options.ipcTimeout] Time to wait before an ipc request aborts
     * @param [options.spawnTimeout] Time to wait before reporting a failed child process spawn
     * @param [options.spawnDelay] Time to wait before spawning another child process
     * @param [options.autoRestart] Whether to automatically restart shards that have been killed unintentionally
     * @param [options.waitForReady] Whether to wait for clusters to be ready before spawning a new one
     * @param [options.handleConcurrency] Whether you want to handle concurrency properly. Enabling this may result into more stable connection
     * @param [options.client] A Discord.js client class or a modified Discord.js client class
     * @param options.token Discord bot token
     */
    constructor(options: IndomitableOptions) {
        super();
        this.clusterCount = options.clusterCount || 'auto';
        this.shardCount = options.shardCount || 'auto';
        this.clientOptions = options.clientOptions || { intents: [ 1 << 0 ] };
        this.clusterSettings = options.clusterSettings || {};
        this.ipcTimeout = options.ipcTimeout ?? 30000;
        this.spawnTimeout = options.spawnTimeout ?? 60000;
        this.spawnDelay = options.spawnDelay ?? 5000;
        this.autoRestart = options.autoRestart ?? false;
        this.waitForReady = options.waitForReady ?? true;
        this.handleConcurrency = options.handleConcurrency ?? false;
        this.client = options.client;
        this.token = options.token;
        this.clusters = new Map();
        this.spawnQueue = [];
        this.concurrencyServer = undefined;
        this.cachedSession = undefined;
        this.busy = false;
    }

    /**
     * Checks the internal private flag if Indomitable is busy
     * @returns Number of clusters in queue
     */
    get isBusy(): boolean {
        return this.busy || false;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets how many clusters are waiting to be spawned
     * @returns Number of clusters in queue
     */
    get inSpawnQueueCount(): number {
        return this.spawnQueue.length;
    }

    /**
     * Gets the current session info of the bot token Indomitable currently handles
     * @returns Session Info
     */
    public async fetchSessions(force = false): Promise<SessionObject> {
        if (!force && this.cachedSession) return this.cachedSession;
        this.cachedSession = await FetchSessions(this.token);
        return this.cachedSession;
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
        if (this.handleConcurrency) {
            const sessions = await this.fetchSessions();
            this.concurrencyServer = new ConcurrencyServer(this, sessions.session_start_limit.max_concurrency);
            const info = await this.concurrencyServer.start();
            this.emit(LibraryEvents.DEBUG, `Handle concurrency is currently enabled! =>\n  Server is currently bound to:\n    Address: ${info.address}:${info.port}\n    Concurrency: ${sessions.session_start_limit.max_concurrency}`);
        }
        if (typeof this.clusterCount !== 'number')
            this.clusterCount = Os.cpus().length;
        if (typeof this.shardCount !== 'number') {
            const sessions = await this.fetchSessions();
            this.shardCount = sessions.shards;
        }
        if (this.shardCount < this.clusterCount)
            this.clusterCount = this.shardCount;
        this.emit(LibraryEvents.DEBUG, `Starting ${this.shardCount} websocket shards across ${this.clusterCount} clusters`);
        const shards = [ ...Array(this.shardCount).keys() ];
        const chunks = Chunk(shards, Math.round(this.shardCount / this.clusterCount));
        Cluster.setupPrimary({ ...{ serialization: 'json' }, ...this.clusterSettings  });
        for (let id = 0; id < this.clusterCount; id++) {
            const chunk = chunks.shift()!;
            const cluster = new ClusterManager({ id, shards: chunk, manager: this });
            this.clusters.set(id, cluster);
        }
        await this.addToSpawnQueue(...this.clusters.values());
    }

    /**
     * Restart specified cluster if this instance is the primary process
     * @param clusterId Id of cluster to restart
     * @returns A promise that resolves to void
     */
    public async restart(clusterId: number): Promise<void> {
        if (!Cluster.isPrimary) return;
        const cluster = this.clusters.get(clusterId);
        if (!cluster) throw new Error(`Invalid clusterId, or a cluster with this id doesn\'t exist, received id ${clusterId}`);
        await this.addToSpawnQueue(cluster);
    }

    /**
     * Restart all clusters if this instance is the primary process
     * @returns A promise that resolves to void
     */
    public async restartAll(): Promise<void>  {
        if (!Cluster.isPrimary) return;
        await this.addToSpawnQueue(...this.clusters.values());
    }

    /**
     * Sends a message to a specific cluster
     * @returns A promise that resolves to undefined or an unknown value depending on how you reply to it
     */
    public async send(id: number, sendable: Sendable): Promise<unknown|undefined> {
        const cluster = this.clusters.get(id);
        if (!cluster) throw new Error('Invalid cluster id provided');

        let abortableData: AbortableData|undefined;
        if (this.ipcTimeout !== Infinity && sendable.repliable) {
            abortableData = MakeAbortableRequest(this.ipcTimeout);
        }

        let transportable: Transportable = {
            content: sendable.content,
            repliable: sendable.repliable
        };

        if (abortableData) {
            transportable.signal = abortableData.controller.signal;
        }

        try {
            return await cluster.ipc.send(transportable);
        } finally {
            if (abortableData) {
                clearTimeout(abortableData.timeout);
            }
        }
    }

    /**
     * Sends a message on all clusters
     * @returns An array of promise that resolves to undefined or an unknown value depending on how you reply to it
     */
    public broadcast(sendable: Sendable): Promise<unknown[]> {
        const clusters = [ ...this.clusters.keys() ];
        return Promise.all(clusters.map(id => this.send(id, sendable)));
    }

    /**
     * Reconfigures to launch more shards / clusters without killing the existing processes if possible to avoid big downtimes
     * @remarks Never execute restart() or restartAll() during this process or else you will double restart that cluster / all clusters
     * @returns A promise that resolves to void
     */
    public async reconfigure(options: ReconfigureOptions = {}): Promise<void> {
        if (!Cluster.isPrimary || this.isBusy) return;
        if (!options.shards) {
            const sessions = await this.fetchSessions();
            this.shardCount = sessions.shards;
        }
        this.emit(LibraryEvents.DEBUG, `Reconfigured Indomitable to use ${this.shardCount} shard(s)`);
        const oldClusterCount = Number(this.clusters.size);
        this.clusterCount = options.clusters || this.clusters.size;
        const shards = [ ...Array(this.shardCount).keys() ];
        const chunks = Chunk(shards, Math.round(this.shardCount as number / this.clusterCount));
        if (oldClusterCount < this.clusterCount) {
            const count = this.clusterCount - oldClusterCount;
            for (let id = this.clusterCount - 1; id < count; id++) {
                const cluster = new ClusterManager({ id, shards: [], manager: this });
                this.clusters.set(id, cluster);
            }
        }
        if (oldClusterCount > this.clusterCount) {
            const keys = [ ...this.clusters.keys() ].reverse();
            const range = keys.slice(0, oldClusterCount - this.clusterCount);
            for (const key of range) {
                const cluster = this.clusters.get(key);
                cluster!.destroy();
                this.clusters.delete(key);
            }
        }
        this.emit(LibraryEvents.DEBUG, `Reconfigured Indomitable to use ${this.clusterCount} cluster(s) from ${oldClusterCount} cluster(s)`);
        for (const cluster of this.clusters.values()) {
            cluster.shards = chunks.shift()!;
        }
        this.emit(LibraryEvents.DEBUG, 'Clusters shard ranges reconfigured, moving to spawn queue');
        await this.addToSpawnQueue(...this.clusters.values());
    }

    /**
     * Adds a cluster to spawn queue
     * @internal
     */
    public addToSpawnQueue(...clusters: ClusterManager[]) {
        if (!Cluster.isPrimary) return Promise.resolve(undefined);
        for (const cluster of clusters) {
            if (this.spawnQueue.some(manager => manager.id === cluster.id)) continue;
            this.spawnQueue.push(cluster);
        }
        return this.processQueue();
    }

    /**
     * Destroys the client on a cluster
     * @internal
     */
    private async destroyClusterClient(id: number): Promise<void> {
        const content: InternalOpsData = {
            op: InternalOps.DESTROY_CLIENT,
            data: {},
            internal: true
        };
        await this.send(id, { content, repliable: true });
    }

    /**
     * Processes the cluster queue
     * @internal
     */
    private async processQueue(): Promise<void> {
        if (this.isBusy || !this.spawnQueue.length) return;
        this.busy = true;
        this.emit(LibraryEvents.DEBUG, `Processing spawn queue with ${this.spawnQueue.length} clusters waiting to be spawned....`);
        let cluster: ClusterManager;
        while (this.spawnQueue.length > 0) {
            try {
                cluster = this.spawnQueue.shift()!;
                if (cluster.started) {
                    await this.destroyClusterClient(cluster.id);
                    await cluster.respawn();
                    continue;
                }
                await cluster.spawn();
            } catch (error: unknown) {
                this.emit(LibraryEvents.ERROR, error as Error);
                if (cluster! && this.autoRestart) {
                    this.emit(LibraryEvents.DEBUG, `Failed to spawn Cluster ${cluster.id} containing [ ${cluster.shards.join(', ')} ] shard(s). Re-queuing if not in spawn queue`);
                    this.spawnQueue.push(cluster);
                }
            }
        }
        this.busy = false;
        this.emit(LibraryEvents.DEBUG, 'Cluster Queue Empty! Clusters done booting up');
    }
}
