import { join } from 'node:path';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import {
    FetchingStrategyOptions,
    IShardingStrategy,
    managerToFetchingStrategyOptions,
    WebSocketManager,
    WebSocketShardDestroyOptions,
    WebSocketShardDestroyRecovery,
    WebSocketShardStatus
} from '@discordjs/ws';
import { Collection } from 'discord.js';
import { MainStrategyData, MainStrategyOps } from '../Util';
import { MainStrategyWorker } from '../ipc/MainStrategyWorker';
import { BaseWorker } from '../ipc/BaseWorker';

export interface WorkerData extends FetchingStrategyOptions {
    shardId: number;
}

export interface IndomitableWorker {
    thread: Worker;
    ipc: MainStrategyWorker;
}

export class IndomitableStrategy implements IShardingStrategy {
    public readonly manager: WebSocketManager;
    public readonly ipc: BaseWorker;
    public readonly workers: Collection<number, IndomitableWorker>;
    constructor(manager: WebSocketManager, ipc: BaseWorker) {
        this.manager = manager;
        this.ipc = ipc;
        this.workers = new Collection<number, IndomitableWorker>();
    }

    public async spawn(shardIds: number[]): Promise<void> {
        const strategyOptions = await managerToFetchingStrategyOptions(this.manager);
        const promises = shardIds.map(shardId => this.createWorker(shardId, { ...strategyOptions, shardId }));
        await Promise.all(promises);
    }

    public async connect(): Promise<void> {
        const promises = [];
        for (const worker of this.workers.values()) {
            const content: MainStrategyData = {
                op: MainStrategyOps.CONNECT,
                data: {},
                internal: true
            };
            promises.push(worker.ipc.send({ content, repliable: true }));
        }
        await Promise.all(promises);
    }

    public async destroy(data: Omit<WebSocketShardDestroyOptions, 'recover'> = {}): Promise<void> {
        const promises = [];
        for (const worker of this.workers.values()) {
            const content: MainStrategyData = {
                op: MainStrategyOps.DESTROY,
                data,
                internal: true
            };
            promises.push(worker.ipc.send({ content, repliable: true }));
        }
        await Promise.all(promises);
    }

    public async reconnect(shardId: number): Promise<void> {
        const worker = this.workers.get(shardId);
        if (!worker)
            throw new Error(`No worker found for shard #${shardId}`);
        const content: MainStrategyData = {
            op: MainStrategyOps.RECONNECT,
            data: { recovery: WebSocketShardDestroyRecovery.Reconnect },
            internal: true
        };
        await worker.ipc.send({ content, repliable: true });
    }

    public async send(shardId: number, data: any): Promise<void> {
        const worker = this.workers.get(shardId);
        if (!worker)
            throw new Error(`No worker found for shard #${shardId}`);
        const content: MainStrategyData = {
            op: MainStrategyOps.SEND,
            data,
            internal: true
        };
        await worker.ipc.send({ content, repliable: true });
    }

    public async fetchStatus(): Promise<Collection<number, WebSocketShardStatus>> {
        const collection: Collection<number, WebSocketShardStatus> = new Collection();
        const promises = this.workers.map(async (worker, id) => {
            const content: MainStrategyData = {
                op: MainStrategyOps.STATUS,
                data: {},
                internal: true
            };
            const status = await worker.ipc.send({ content, repliable: true });
            collection.set(id, status as WebSocketShardStatus);
        });
        await Promise.all(promises);
        return collection;
    }

    private async createWorker(shardId: number, workerData: WorkerData): Promise<Worker> {
        const thread = new Worker(join(__dirname, 'Thread.js'), { workerData });
        await once(thread, 'online');
        const ipc = new MainStrategyWorker(shardId, thread, this);
        thread
            .on('error', error => {
                throw error;
            })
            .on('message', message => ipc.handleRawResponse(message, () => null));
        this.workers.set(shardId, { thread, ipc });
        return thread;
    }
}
