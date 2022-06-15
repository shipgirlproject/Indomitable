import { Indomitable } from '../Indomitable';
import { Worker } from '../ipc/Worker';
import { ClientEvents, InternalEvents, Transportable } from '../Util';
import EventEmitter from 'events';

export class ShardClientUtil extends EventEmitter {
    public readonly client: any;
    public readonly mode: string;
    public readonly ipc: Worker;
    public readonly clusterId: number;
    public readonly clusterCount: number;
    public readonly shardIds: number[];
    public readonly shardCount: number;
    constructor(manager: Indomitable, client: unknown) {
        super();
        this.client = client;
        this.mode = 'cluster';
        this.ipc = new Worker(this, manager);
        this.clusterId = Number(process.env.CLUSTER);
        this.clusterCount = Number(process.env.CLUSTER_TOTAL);
        this.shardIds = this.client.options.shards;
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