import type { Client } from 'discord.js';
import EventEmitter from 'node:events';
import { clearTimeout } from 'timers';
import { Indomitable } from '../Indomitable';
import { Worker as WorkerIpc } from '../ipc/Worker';
import {
    MakeAbortableRequest,
    AbortableData,
    ClientEvents,
    InternalEvents,
    Message,
    SessionObject,
    Transportable
} from '../Util';

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
 * A class that replaces d.js stock shard client util. The class is built similar to it with minor changes
 */
export class ShardClientUtil extends EventEmitter {
    public client?: Client;
    public readonly ipc: WorkerIpc;
    public readonly clusterId: number;
    public readonly clusterCount: number;
    public readonly shardIds: number[];
    public readonly shardCount: number;
    constructor(manager: Indomitable) {
        super();
        this.ipc = new WorkerIpc(this, manager);
        this.clusterId = Number(process.env.INDOMITABLE_CLUSTER);
        this.clusterCount = Number(process.env.INDOMITABLE_CLUSTER_TOTAL);
        this.shardIds = process.env.INDOMITABLE_SHARDS!.split(' ').map(Number);
        this.shardCount = Number(process.env.INDOMITABLE_SHARDS_TOTAL);
    }

    /**
     * Builds the pre-initialized shard client util
     * @internal
     */
    public build(client: Client): void {
        if (this.client) return;
        this.client = client;
        this.ipc.build();
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
        const end = await this.send({ content, repliable: true }) as number;
        return Number(BigInt(end) - start);
    }

    /**
     * Evaluates a script or function on all clusters in the context of the client
     * @returns A promise that resolves to an array of code results
     */
    public broadcastEval(script: Function, context: any = {}): Promise<unknown[]> {
        const content: InternalEvents = {
            op: ClientEvents.EVAL,
            data: `(${script.toString()})(this, ${JSON.stringify(context)})`,
            internal: true
        };
        return this.send({ content, repliable: true }) as Promise<unknown[]>;
    }

    /**
     * Fetches a client property value on all clusters
     * @returns A promise that resolves to an array of code results
     */
    public fetchClientValues(prop: string): Promise<unknown[]> {
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
        return this.send({ content, repliable: true }) as Promise<SessionObject>;
    }

    /**
     * Restarts the given cluster from the clusterId given
     * @returns A promise that resolves to void
     */
    public restart(clusterId: number): Promise<undefined> {
        const content: InternalEvents = {
            op: ClientEvents.RESTART,
            data: { clusterId },
            internal: true
        };
        return this.send({ content }) as Promise<undefined>;
    }

    /**
     * Restarts all the clusters Indomitable handles sequentially
     * @returns A promise that resolves to void
     */
    public restartAll(): Promise<undefined> {
        const content: InternalEvents = {
            op: ClientEvents.RESTART_ALL,
            data: {},
            internal: true
        };
        return this.send({ content }) as Promise<undefined>;
    }

    /**
     * Sends a message to primary process
     * @returns A promise that resolves to void or a repliable object
     */
    public async send(transportable: Transportable): Promise<unknown|undefined> {
        let abortableData: AbortableData | undefined;
        if (!transportable.signal && (this.ipc.manager.ipcTimeout !== Infinity && transportable.repliable)) {
            abortableData = MakeAbortableRequest(this.ipc.manager.ipcTimeout);
            transportable.signal = abortableData.controller.signal;
        }
        return await this.ipc
            .send(transportable)
            .finally(() => {
                if (!abortableData) return;
                clearTimeout(abortableData.timeout);
            });
    }
}
