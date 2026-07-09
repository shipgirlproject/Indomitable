import EventEmitter from "node:events";
import process from "node:process";
import { clearTimeout } from "node:timers";
import type { WebSocketManager } from "@discordjs/ws";
import type { Client } from "discord.js";
import type { Indomitable } from "../Indomitable.js";
import type { AbortableData, InternalOpsData, Message, SessionObject, Transportable } from "../Util.js";
import { EnvProcessData, MakeAbortableRequest, InternalOps } from "../Util.js";
import { ClientWorker } from "../ipc/ClientWorker.js";
import type { IndomitableShardingStrategyInterface } from "../strategies/IndomitableShardingStrategyInterface.js";

export interface ShardClientUtilEvents {
	message: [message: Message];
}

/**
 * A class that replaces d.js stock shard client util. The class is built similar to it with minor changes
 */
export class ShardClientUtil extends EventEmitter<ShardClientUtilEvents> {
	public client: Client;

	public readonly ipc: ClientWorker;

	public readonly clusterId: number;

	public readonly clusterCount: number;

	public readonly shardIds: number[];

	public readonly shardCount: number;

	public constructor(client: Client, manager: Indomitable) {
		super();
		this.client = client;
		this.ipc = new ClientWorker(this, manager);
		this.clusterId = EnvProcessData.clusterId;
		this.clusterCount = EnvProcessData.clusterCount;
		this.shardIds = EnvProcessData.shardIds;
		this.shardCount = EnvProcessData.shardCount;
	}

	/**
	 * Gets the current ipc delay
	 *
	 * @returns A promise that resolves to delay in nanoseconds
	 */
	public async ping(): Promise<number> {
		const content: InternalOpsData = {
			op: InternalOps.PING,
			data: {},
			internal: true,
		};
		const start = process.hrtime.bigint();
		const end = (await this.send({ content, repliable: true })) as number;
		return Number(BigInt(end) - start);
	}

	/**
	 * Returns the current WebSocket sharding strategy.
	 */
	public get strategy(): IndomitableShardingStrategyInterface {
		// @ts-expect-error internal field
		// eslint-disable-next-line @typescript-eslint/dot-notation
		return (this.client.ws["_ws"] as WebSocketManager).strategy;
	}

	/**
	 * Evaluates a script or function on all clusters in the context of the client
	 *
	 * @returns A promise that resolves to an array of code results
	 */
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	public async broadcastEval(script: Function, context: any = {}): Promise<unknown[]> {
		const content: InternalOpsData = {
			op: InternalOps.EVAL,
			data: `(${script.toString()})(this, ${JSON.stringify(context)})`,
			internal: true,
		};
		return this.send({ content, repliable: true }) as Promise<unknown[]>;
	}

	/**
	 * Fetches a client property value on all clusters
	 *
	 * @returns A promise that resolves to an array of code results
	 */
	public async fetchClientValues(prop: string): Promise<unknown[]> {
		return this.broadcastEval((client: { [key: string]: any }) => client[prop]);
	}

	/**
	 * Gets the cached session info or fetches an updated session info
	 *
	 * @param update If you want to fetch and update the cached session info
	 * @returns A session object
	 */
	public async fetchSessions(update: boolean = false): Promise<SessionObject> {
		const content: InternalOpsData = {
			op: InternalOps.SESSION_INFO,
			data: { update },
			internal: true,
		};
		return this.send({ content, repliable: true }) as Promise<SessionObject>;
	}

	/**
	 * Restarts the given cluster from the clusterId given
	 *
	 * @returns A promise that resolves to void
	 */
	public async restart(clusterId: number): Promise<undefined> {
		const content: InternalOpsData = {
			op: InternalOps.RESTART,
			data: { clusterId },
			internal: true,
		};
		return this.send({ content }) as Promise<undefined>;
	}

	/**
	 * Restarts all the clusters Indomitable handles sequentially
	 *
	 * @returns A promise that resolves to void
	 */
	public async restartAll(): Promise<undefined> {
		const content: InternalOpsData = {
			op: InternalOps.RESTART_ALL,
			data: {},
			internal: true,
		};
		return this.send({ content }) as Promise<undefined>;
	}

	/**
	 * Sends a message to primary process
	 *
	 * @returns A promise that resolves to void or a repliable object
	 */
	public async send(transportable: Transportable): Promise<unknown | undefined> {
		const manager = this.ipc.manager as Indomitable;
		let abortableData: AbortableData | undefined;
		if (!transportable.signal && manager.ipcTimeout !== Infinity && transportable.repliable) {
			abortableData = MakeAbortableRequest(manager.ipcTimeout);
			transportable.signal = abortableData.controller.signal;
		}

		try {
			return await this.ipc.send(transportable);
		} finally {
			if (abortableData) {
				clearTimeout(abortableData.timeout);
			}
		}
	}
}
