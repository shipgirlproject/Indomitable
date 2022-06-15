import Cluster, { Worker } from 'cluster';
import { Indomitable } from './Indomitable';
import { ClientEvents, Delay, LibraryEvents } from './Util';

export interface ProcessOptions {
    id: number;
    shards: number[];
    manager: Indomitable;
}

export class ClusterManager {
    public readonly manager: Indomitable;
    public readonly id: number;
    public readonly shards: number[];
    public worker?: Worker;
    public tickReady?: Function;
    constructor(options: ProcessOptions) {
        this.manager = options.manager;
        this.id = options.id;
        this.shards = options.shards;
        this.worker = undefined;
        this.tickReady = undefined;
    }

    public cleanup(): void {
        this.worker?.removeAllListeners();
        this.worker = undefined;
    }

    public destroy(signal: string = 'SIGTERM'): void {
        this.worker?.kill(signal);
        this.cleanup();
    }

    public async respawn(delay: number = this.manager.spawnDelay): Promise<void> {
        this.manager.emit('debug', `Killing the cluster with SIGKILL, then restarting it in ${delay}ms...`);
        this.destroy('SIGKILL');
        if (delay) await Delay(delay);
        await this.spawn();
    }

    public async spawn(): Promise<void> {
        this.worker = Cluster.fork({
            SHARDS: this.shards.join(' '),
            SHARDS_TOTAL: this.manager.shardCount.toString(),
            CLUSTER: this.id.toString(),
            CLUSTER_TOTAL: this.manager.clusterCount.toString(),
            ...process.env
        });
        this.worker.once('exit', (code, signal) => {
            this.cleanup();
            this.manager.emit('debug', `Cluster ${this.id} exited with close code ${code} signal ${signal}`);
            this.manager.emit(LibraryEvents.WORKER_EXIT, code, signal, this);
        });
        this.manager.emit('debug', `Succesfully forked Cluster ${this.id}, waiting for the client to be ready...`);
        this.manager.emit(LibraryEvents.WORKER_FORK, this);
        await this.wait();
        await Delay(this.manager.spawnDelay);
    }

    private wait(): Promise<void> {
        return new Promise((resolve, reject) => {
            const ms = this.manager.spawnTimeout * this.shards.length;
            const timeout = setTimeout(() => {
                this.tickReady = undefined;
                reject(new Error(`The shard did not get ready in ${Math.round(ms / 1000)} seconds`));
            }, ms);
            this.tickReady = () => {
                clearTimeout(timeout);
                resolve();
            };
        });
    }
}
