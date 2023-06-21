import Cluster, { Worker } from 'node:cluster';
import { clearTimeout } from 'timers';
import { Indomitable, ShardEventData } from '../Indomitable.js';
import { Main } from '../ipc/Main.js';
import { Delay, LibraryEvents } from '../Util.js';

/**
 * Options for child processes
 */
export interface ClusterManagerOptions {
    id: number;
    shards: number[];
    manager: Indomitable;
}

/**
 * A class to manage a cluster
 */
export class ClusterManager {
    public readonly manager: Indomitable;
    public readonly id: number;
    public readonly ipc: Main;
    public shards: number[];
    public started: boolean;
    public ready: boolean;
    public readyAt: number;
    public worker?: Worker;

    /**
     * @param options.id ClusterId of this Cluster Manager being created
     * @param options.shards An array of numbers representing the shards that this cluster controls
     * @param options.manager Indomitable instance that spawned this cluster
     */
    constructor(options: ClusterManagerOptions) {
        this.manager = options.manager;
        this.id = options.id;
        this.shards = options.shards;
        this.ipc = new Main(this);
        this.started = false;
        this.started = false;
        this.ready = false;
        this.readyAt = -1;
        this.worker = undefined;
    }

    /**
     * Destroy associated worker process
     * @param signal Process exit signal
     */
    public destroy(signal: string = 'SIGTERM') {
        this.worker?.kill(signal);
        this.cleanup(0, signal);
    }

    /**
     * Respawn associated worker process
     * @param delay Time to wait before restarting worker process
     */
    public async respawn(delay: number = this.manager.spawnDelay) {
        this.manager.emit(LibraryEvents.DEBUG, `Restarting Cluster ${this.id} containing [ ${this.shards.join(', ')} ] shard(s)...`);
        this.destroy('SIGKILL');
        await Delay(delay);
        await this.spawn();
    }

    /**
     * Spawn a worker process
     */
    public async spawn() {
        this.manager.emit(LibraryEvents.DEBUG, `Spawning Cluster ${this.id} containing [ ${this.shards.join(', ')} ] shard(s)...`);
        this.worker = Cluster.fork({
            INDOMITABLE_SHARDS: this.shards.join(' '),
            INDOMITABLE_SHARDS_TOTAL: this.manager.shardCount.toString(),
            INDOMITABLE_CLUSTER: this.id.toString(),
            INDOMITABLE_CLUSTER_TOTAL: this.manager.clusterCount.toString(),
            ...process.env
        });
        this.worker
            .on('message', message => this.ipc.handleRawResponse(message, error => this.manager.emit(LibraryEvents.ERROR, error as Error)))
            .on('error', error => this.manager.emit(LibraryEvents.ERROR, error as Error))
            .once('exit', (code, signal) => {
                this.cleanup(code, signal);
                if (!this.manager.autoRestart) return;
                this.manager.addToSpawnQueue(this);
            });
        if (!this.started) this.started = true;
        this.manager.emit(LibraryEvents.WORKER_FORK, this);
        if (this.manager.waitForReady) await this.wait();
        this.manager.emit(LibraryEvents.DEBUG, `Successfully spawned Cluster ${this.id} containing [ ${this.shards.join(', ')} ] shard(s)! | Waited for cluster ready? ${this.manager.waitForReady}`);
        this.manager.emit(LibraryEvents.WORKER_READY, this);
        await Delay(this.manager.spawnDelay);
    }

    /**
     * Remove all listeners on attached worker process and free from memory
     */
    private cleanup(code: number|null, signal: string|null) {
        this.ipc.flushPromises(`Cluster exited with close code ${code || 'unknown'} signal ${signal || 'unknown'}`);
        this.worker?.removeAllListeners();
        this.worker = undefined;
        this.ready = false;
        this.readyAt = -1;
        this.manager.emit(LibraryEvents.DEBUG, `Cluster ${this.id} exited with close code ${code || 'unknown'} signal ${signal || 'unknown'}`);
        this.manager.emit(LibraryEvents.WORKER_EXIT, code, signal, this);
    }

    /**
     * Waits for this cluster to be ready
     * @returns A promise that resolves to void
     * @internal
     */
    private wait(): Promise<void> {
        return new Promise((resolve, reject) => {
            const ms = this.manager.spawnTimeout * this.shards.length;
            const seconds = Math.round(ms / 1000);
            this.manager.emit(LibraryEvents.DEBUG, `Waiting for client ready event for ${seconds} second(s)`);
            let timeout: NodeJS.Timer|undefined;
            const listener = (data: ShardEventData) => {
                if (data.clusterId !== this.id) return;
                this.ready = true;
                this.readyAt = Date.now();
                this.manager.off(LibraryEvents.CLIENT_READY, listener);
                clearTimeout(timeout);
                resolve();
            };
            timeout = setTimeout(() => {
                this.manager.off(LibraryEvents.CLIENT_READY, listener);
                this.destroy();
                reject(new Error(`Cluster ${this.id} did not get ready in ${seconds} second(s)`));
            }, ms).unref();
            this.manager.on(LibraryEvents.CLIENT_READY, listener);
        });
    }
}
