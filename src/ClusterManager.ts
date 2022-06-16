import Cluster, { Worker } from 'node:cluster';
import { Indomitable } from './Indomitable';
import { Delay, LibraryEvents } from './Util';

/**
 * Options for child processes
 */
export interface ProcessOptions {
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
    public readonly shards: number[];
    public started: boolean;
    public worker?: Worker;
    public tickReady?: Function;

    /**
     * @param options.id Cluster ID
     * @param options.shards An array of numbers representing the shards that this cluster controls
     * @param options.manager Indomitable instance that spawned this cluster
     */
    constructor(options: ProcessOptions) {
        this.manager = options.manager;
        this.id = options.id;
        this.shards = options.shards;
        this.started = false;
        this.worker = undefined;
        this.tickReady = undefined;
    }

    /**
     * Destroy associated worker process
     * @param signal Process exit signal
     */
    public destroy(signal: string = 'SIGTERM') {
        // no need to call cleanup here, we always attach an exit listener to clean
        this.worker?.kill(signal);
    }

    /**
     * Respawn associated worker process
     * @param delay Time to wait before restarting worker process
     */
    public async respawn(delay: number = this.manager.spawnDelay) {
        this.destroy('SIGKILL');
        if (delay) await Delay(delay);
        await this.spawn();
    }

    /**
     * Spawn a worker process
     */
    public async spawn() {
        this.manager.emit(LibraryEvents.DEBUG, `Spawning Cluster ${this.id} containing [ ${this.shards.join(', ')} ] shard(s)...`);
        this.worker = Cluster.fork({
            SHARDS: this.shards.join(' '),
            SHARDS_TOTAL: this.manager.shardCount.toString(),
            CLUSTER: this.id.toString(),
            CLUSTER_TOTAL: this.manager.clusterCount.toString(),
            ...process.env
        });
        this.worker.once('exit', (code, signal) => {
            this.cleanup();
            this.manager.emit(LibraryEvents.DEBUG, `Cluster ${this.id} exited with close code ${code} signal ${signal}`);
            this.manager.emit(LibraryEvents.WORKER_EXIT, code, signal, this);
        });
        this.manager.emit(LibraryEvents.WORKER_FORK, this);
        await this.wait();
        this.manager.emit(LibraryEvents.WORKER_READY, this);
        this.manager.emit(LibraryEvents.DEBUG, `Succesfully spawned Cluster ${this.id}, waiting for the cluster to be ready...`);
        await Delay(this.manager.spawnDelay);
        // ensures that autoRestart won't conflict with retryFailed
        if (!this.started) this.started = true;
    }

    /**
     * Remove all listeners on attached worker process and free from memory
     */
    private cleanup() {
        this.worker?.removeAllListeners();
        this.worker = undefined;
    }

    /**
     * Time to wait before reporting a fail when spawning a new shard
     * @returns A promise that resolves to void
     * @internal
     */
    private wait(): Promise<void> {
        return new Promise((resolve, reject) => {
            const ms = this.manager.spawnTimeout * this.shards.length;
            const timeout = setTimeout(() => {
                this.tickReady = undefined;
                this.destroy();
                reject(new Error(`The shard did not get ready in ${Math.round(ms / 1000)} seconds`));
            }, ms);
            this.tickReady = () => {
                clearTimeout(timeout);
                resolve();
            };
        });
    }
}
