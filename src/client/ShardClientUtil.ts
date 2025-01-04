import type { Client } from 'discord.js';
import type { Message } from '../ipc/BaseSocket';
import type { Indomitable } from '../Indomitable';
import EventEmitter from 'node:events';
import { clearTimeout } from 'timers';
import { ClientSocket } from '../ipc/ClientSocket';
import {
    AbortableData,
    EnvProcessData,
    InternalOps,
    InternalOpsData,
    MakeAbortableRequest,
    SessionObject,
    Transportable
} from '../Util';

export declare interface ShardClientUtil {
    /**
     * Emitted when an IPC message from parent process is received
     * @eventProperty
     */
    on(event: 'message', listener: (message: Message | unknown) => void): this;

    once(event: 'message', listener: (message: Message | unknown) => void): this;

    off(event: 'message', listener: (message: Message | unknown) => void): this;
}

/**
 * A class that replaces d.js stock shard client util. The class is built similar to it with minor changes
 */
export class ShardClientUtil extends EventEmitter {
    public client: Client;
    public readonly clusterId: number;
    public readonly clusterCount: number;
    public readonly shardIds: number[];
    public readonly shardCount: number;
    public readonly ipc: ClientSocket;
    private readonly manager: Indomitable;

    constructor(client: Client, manager: Indomitable) {
        super();
        this.client = client;
        this.manager = manager;
        this.clusterId = EnvProcessData.clusterId;
        this.clusterCount = EnvProcessData.clusterCount;
        this.shardIds = EnvProcessData.shardIds;
        this.shardCount = EnvProcessData.shardCount;
        this.ipc = new ClientSocket(this, EnvProcessData.serverIpcId);

        this.ipc.connect();
    }

    /**
     * Gets the current ipc delay
     * @returns A promise that resolves to delay in nanoseconds
     */
    public async ping(): Promise<number> {
        const content: InternalOpsData = {
            op: InternalOps.PING,
            data: {},
            internal: true
        };
        const start = process.hrtime.bigint();
        const end = await this.send({ content, reply: true }) as number;
        return Number(BigInt(end) - start);
    }

    /**
     * Evaluates a script or function on all clusters in the context of the client
     * @returns A promise that resolves to an array of code results
     */
    public broadcastEval(script: Function, context: any = {}): Promise<unknown[]> {
        const content: InternalOpsData = {
            op: InternalOps.EVAL,
            data: `(${ script.toString() })(this, ${ JSON.stringify(context) })`,
            internal: true
        };
        return this.send({ content, reply: true }) as Promise<unknown[]>;
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
        const content: InternalOpsData = {
            op: InternalOps.SESSION_INFO,
            data: { update },
            internal: true
        };
        return this.send({ content, reply: true }) as Promise<SessionObject>;
    }

    /**
     * Restarts the given cluster from the clusterId given
     * @returns A promise that resolves to void
     */
    public restart(clusterId: number): Promise<undefined> {
        const content: InternalOpsData = {
            op: InternalOps.RESTART,
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
        const content: InternalOpsData = {
            op: InternalOps.RESTART_ALL,
            data: {},
            internal: true
        };
        return this.send({ content }) as Promise<undefined>;
    }

    /**
     * Sends a message to primary process
     * @returns A promise that resolves to void or a repliable object
     */
    public async send(transportable: Transportable): Promise<unknown | undefined> {
        let abortableData: AbortableData | undefined;
        if (!transportable.signal && (this.manager.ipcTimeout !== Infinity && transportable.reply)) {
            abortableData = MakeAbortableRequest(this.manager.ipcTimeout);
            transportable.signal = abortableData.controller.signal;
        }
        try {
            return await this.ipc.send(transportable);
        } finally {
            if (abortableData) clearTimeout(abortableData.timeout);
        }
    }
}
