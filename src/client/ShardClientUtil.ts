import type { Client } from 'discord.js';
import { Indomitable } from '../Indomitable';
import {
    MakeAbortableRequest,
    AbortableData,
    ClientEvents,
    InternalEvents,
    Message,
    SessionObject,
    Transportable
} from '../Util';
import { Worker as WorkerIpc } from '../ipc/Worker';
import EventEmitter from 'node:events';
import { clearTimeout } from 'timers';

export declare interface ShardClientUtil {
    /**
     * Emitted when an IPC message from parent process is received
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
    public client: Client;
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
        this.clusterId = Number(process.env.INDOMITABLE_CLUSTER);
        this.clusterCount = Number(process.env.INDOMITABLE_CLUSTER_TOTAL);
        this.shardIds = process.env.INDOMITABLE_SHARDS!.split(' ').map(Number);
        this.shardCount = Number(process.env.INDOMITABLE_SHARDS_TOTAL);
    }

    /**
     * Gets the current ipc delay
     * @returns A promise that resolves to delay in nanoseconds
     */
    public async ping(): Promise<number> {
        const content: InternalEvents = {
            op: ClientEvents.PING,
            data: {},
            internal: true
        };
        const start = process.hrtime.bigint();
        const end = await this.send({ content, repliable: true });
        return Number(BigInt(end) - start);
    }

    /**
     * Evaluates a script or function on all clusters in the context of the client
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
     * Shortcut to send a message to the parent process
     * @returns A promise that resolves to void or a repliable object
     */
    public send(transportable: Transportable): Promise<any|void> {
        let abortableData: AbortableData | undefined;
        if (!transportable.signal && (this.ipc.manager.ipcTimeout !== Infinity && transportable.repliable)) {
            abortableData = MakeAbortableRequest(this.ipc.manager.ipcTimeout);
            transportable.signal = abortableData.controller.signal;
        }
        return this.ipc
            .send(transportable)
            .finally(() => {
                if (!abortableData) return;
                clearTimeout(abortableData.timeout);
            });
    }
}
