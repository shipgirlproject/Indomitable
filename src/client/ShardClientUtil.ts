import type { Client } from 'discord.js';
import { Indomitable } from '../Indomitable';
import { Worker } from '../ipc/Worker';
import { ClientEvents, InternalEvents, Message, Transportable } from '../Util';
import EventEmitter from 'events';

export declare interface ShardClientUtil {
    on(event: 'close', listener: (reason: any) => void): this;
    on(event: 'status', listener: (status: number) => void): this;
    on(event: 'message', listener: (message: Message) => void): this;
    on(event: 'error', listener: (error: unknown) => void): this;
    once(event: 'close', listener: (reason: any) => void): this;
    once(event: 'status', listener: (status: number) => void): this;
    once(event: 'message', listener: (message: Message) => void): this;
    once(event: 'error', listener: (error: unknown) => void): this;
    off(event: 'close', listener: (reason: any) => void): this;
    off(event: 'status', listener: (status: number) => void): this;
    off(event: 'message', listener: (message: Message) => void): this;
    off(event: 'error', listener: (error: unknown) => void): this;
}

export class ShardClientUtil extends EventEmitter {
    public readonly client: Client;
    public readonly mode: string;
    public readonly ipc: Worker;
    public readonly clusterId: number;
    public readonly clusterCount: number;
    public readonly shardIds: number[];
    public readonly shardCount: number;
    constructor(manager: Indomitable, client: Client) {
        super();
        this.client = client;
        this.mode = 'cluster';
        this.ipc = new Worker(this, manager);
        this.clusterId = Number(process.env.CLUSTER);
        this.clusterCount = Number(process.env.CLUSTER_TOTAL);
        this.shardIds = this.client.options.shards as number[];
        this.shardCount = Number(process.env.SHARDS_TOTAL);
    }

    public broadcastEval(script: Function): Promise<any[]> {
        const content: InternalEvents = {
            op: ClientEvents.EVAL,
            data: `(${script.toString()})(this)`,
            internal: true
        };
        return this.ipc.send({ content, repliable: true });
    }

    public fetchClientValues(prop: string): Promise<any[]> {
        return this.broadcastEval((client: { [key: string]: any; }) => client[prop]);
    }

    public restart(): Promise<void> {
        const content: InternalEvents = {
            op: ClientEvents.RESTART,
            data: {},
            internal: true
        };
        return this.ipc.send({ content });
    }

    public restartAll(): Promise<void> {
        const content: InternalEvents = {
            op: ClientEvents.RESTART_ALL,
            data: {},
            internal: true
        };
        return this.ipc.send({ content });
    }

    public send(transportable: Transportable): Promise<any|void> {
        return this.ipc.send(transportable);
    }
}
