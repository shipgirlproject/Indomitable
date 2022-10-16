import type { Client } from 'discord.js';
import { Indomitable } from '../Indomitable';
import { ClientEvents, InternalEvents, Message, SessionObject, Transportable } from '../Util';
import { Worker as WorkerIpc } from '../ipc/Worker';
import EventEmitter from 'node:events';

export declare interface ShardClientUtil {
    /**
     * Emmited when an IPC message from parent process is recieved
     * @eventProperty
     */
    on(event: 'message', listener: (message: Message|unknown) => void): this;
    once(event: 'message', listener: (message: Message|unknown) => void): this;
    off(event: 'message', listener: (message: Message|unknown) => void): this;
}

/**
 * A class for your interprocess communication needs
 */
export class ShardClientUtil extends EventEmitter {
    public readonly client: Client;
    public readonly mode: string;
    public readonly ipc: WorkerIpc;
    public readonly clusterId: number;
    public readonly clusterCount: number;
    public readonly shardIds: number[];
    public readonly shardCount: number;
    constructor(manager: Indomitable, client: Client) {
        super();
        this.client = client;
        this.mode = 'cluster';
        this.ipc = new WorkerIpc(this, manager);
        this.clusterId = Number(process.env.CLUSTER);
        this.clusterCount = Number(process.env.CLUSTER_TOTAL);
        this.shardIds = this.client.options.shards as number[];
        this.shardCount = Number(process.env.SHARDS_TOTAL);
    }

    /**
     * A shortcut to get the current ipc delay
     * @returns A promise that resolves to delay in nanoseconds
     */
    public ping(): Promise<number> {
        return this.ipc.ping();
    }

    /**
     * Evaluates a script or function on all clusters in the context of the your client
     * @returns A promise that resolves to an array of code results
     */
    public broadcastEval(script: Function, context: any = {}): Promise<any[]> {
        const content: InternalEvents = {
            op: ClientEvents.EVAL,
            data: `(${script.toString()})(this, ${JSON.stringify(context)})`,
            internal: true
        };
        return this.ipc.send({ content, repliable: true });
    }

    /**
     * Fetches a client property value on all clusters
     * @returns A promise that resolves to an array of code results
     */
    public fetchClientValues(prop: string): Promise<any[]> {
        return this.broadcastEval((client: { [key: string]: any; }) => client[prop]);
    }

    /**
     * Gets the cached session info or fetches an updated session info
     * @param update If you want to fetch and update the cached session info
     * @returns A session object
     */
    public fetchSessions(update: boolean = false): Promise<SessionObject> {
        const content: InternalEvents = {
            op: ClientEvents.SESSION_INFO,
            data: { update },
            internal: true
        };
        return this.ipc.send({ content, repliable: true });
    }

    /**
     * Restarts the given cluster from the clusterId given
     * @returns A promise that resolves to void
     */
    public restart(clusterId: number): Promise<void> {
        const content: InternalEvents = {
            op: ClientEvents.RESTART,
            data: { clusterId },
            internal: true
        };
        return this.ipc.send({ content });
    }

    /**
     * Restarts all the clusters Indomitable handles sequentially
     * @returns A promise that resolves to void
     */
    public restartAll(): Promise<void> {
        const content: InternalEvents = {
            op: ClientEvents.RESTART_ALL,
            data: {},
            internal: true
        };
        return this.ipc.send({ content });
    }

    /**
     * Shorcut to send a message to the parent process
     * @returns A promise that resolves to void or an repliable object
     */
    public send(transportable: Transportable): Promise<any|void> {
        return this.ipc.send(transportable);
    }
}
