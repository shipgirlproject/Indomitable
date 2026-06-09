import type { ClusterSettings } from "node:cluster";
import Cluster from "node:cluster";
import EventEmitter from "node:events";
import Os from "node:os";
import { clearTimeout } from "node:timers";
import type { Client, ClientOptions as DiscordJsClientOptions } from "discord.js";
import type { AbortableData, InternalOpsData, Message, SessionObject, Transportable, Sendable } from "./Util.js";
import { Chunk, FetchSessions, MakeAbortableRequest, InternalOps, LibraryEvents } from "./Util.js";
import { ShardClient } from "./client/ShardClient.js";
import { ConcurrencyServer } from "./concurrency/ConcurrencyServer.js";
import { ClusterManager } from "./manager/ClusterManager.js";

/**
 * Options to control Indomitable behavior
 */
export interface IndomitableOptions {
	autoRestart?: boolean;
	client: typeof Client;
	clientOptions?: DiscordJsClientOptions;
	clusterCount?: number | "auto";
	clusterSettings?: ClusterSettings;
	handleConcurrency?: boolean;
	ipcTimeout?: number;
	shardCount?: number | "auto";
	spawnDelay?: number;
	spawnTimeout?: number;
	token: string;
	waitForReady?: boolean;
}

export interface ReconfigureOptions {
	clusters?: number;
	shards?: number;
}
export interface ShardEventData {
	clusterId: number;
	event?: CloseEvent;
	replayed?: number;
	shardId?: number;
}

export interface IndomitableEvents {
	clientReady: [event: ShardEventData];
	debug: [message: string];
	error: [error: unknown];
	message: [message: Message | unknown];
	raw: [event: unknown];
	shardDisconnect: [event: ShardEventData];
	shardReady: [event: ShardEventData];
	shardReconnect: [event: ShardEventData];
	shardResume: [event: ShardEventData];
	workerExit: [code: number | null, signal: string | null, cluster: ClusterManager];
	workerFork: [cluster: ClusterManager];
	workerReady: [cluster: ClusterManager];
}

/**
 * The main Indomitable class, exposing all functionality.
 */
export class Indomitable extends EventEmitter<IndomitableEvents> {
	public clusterCount: number | "auto";

	public shardCount: number | "auto";

	public cachedSession?: SessionObject;

	public concurrencyServer?: ConcurrencyServer;

	public readonly clientOptions: DiscordJsClientOptions;

	public readonly clusterSettings: ClusterSettings;

	public readonly ipcTimeout: number;

	public readonly spawnTimeout: number;

	public readonly spawnDelay: number;

	public readonly autoRestart: boolean;

	public readonly waitForReady: boolean;

	public readonly handleConcurrency: boolean;

	public readonly client: typeof Client;

	public readonly clusters: Map<number, ClusterManager>;

	private readonly spawnQueue: ClusterManager[];

	private readonly token: string;

	private busy: boolean;

	/**
	 * // eslint-disable-next-line jsdoc/check-param-names
	 *
	 * @param [options.clusterCount] The amount of clusters to spawn. Expects a number or 'auto'
	 * @param [options.shardCount] The number of shards to create. Expects a number or 'auto'
	 * @param [options.clientOptions] Options for the Discord.js client
	 * @param [options.clusterSettings] Options for the forked process
	 * @param [options.ipcTimeout] Time to wait before an ipc request aborts
	 * @param [options.spawnTimeout] Time to wait before reporting a failed child process spawn
	 * @param [options.spawnDelay] Time to wait before spawning another child process
	 * @param [options.autoRestart] Whether to automatically restart shards that have been killed unintentionally
	 * @param [options.waitForReady] Whether to wait for clusters to be ready before spawning a new one
	 * @param [options.handleConcurrency] Whether you want to handle concurrency properly. Enabling this may result into more stable connection
	 * @param [options.client] A Discord.js client class or a modified Discord.js client class
	 * @param options.token Discord bot token
	 */
	public constructor(options: IndomitableOptions) {
		super();
		this.clusterCount = options.clusterCount ?? "auto";
		this.shardCount = options.shardCount ?? "auto";
		// eslint-disable-next-line unicorn/prefer-math-trunc
		this.clientOptions = options.clientOptions ?? { intents: [1 << 0] };
		this.clusterSettings = options.clusterSettings ?? {};
		this.ipcTimeout = options.ipcTimeout ?? 30_000;
		this.spawnTimeout = options.spawnTimeout ?? 60_000;
		this.spawnDelay = options.spawnDelay ?? 5_000;
		this.autoRestart = options.autoRestart ?? false;
		this.waitForReady = options.waitForReady ?? true;
		this.handleConcurrency = options.handleConcurrency ?? false;
		this.client = options.client;
		this.token = options.token;
		this.clusters = new Map();
		this.spawnQueue = [];
		this.concurrencyServer = undefined;
		this.cachedSession = undefined;
		this.busy = false;
	}

	/**
	 * Checks the internal private flag if Indomitable is busy
	 *
	 * @returns Number of clusters in queue
	 */
	public get isBusy(): boolean {
		return this.busy || false;
	}

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Gets how many clusters are waiting to be spawned
	 *
	 * @returns Number of clusters in queue
	 */
	public get inSpawnQueueCount(): number {
		return this.spawnQueue.length;
	}

	/**
	 * Gets the current session info of the bot token Indomitable currently handles
	 *
	 * @returns Session Info
	 */
	public async fetchSessions(force = false): Promise<SessionObject> {
		if (!force && this.cachedSession) {
			return this.cachedSession;
		}

		this.cachedSession = await FetchSessions(this.token);
		return this.cachedSession;
	}

	/**
	 * Spawn a new ShardClient if this instance is a child process, or start a new cluster and IPC server if this instance is the primary process
	 *
	 * @returns A promise that resolves to void
	 */
	public async spawn(): Promise<void> {
		if (!Cluster.isPrimary) {
			const shardClient = new ShardClient(this);
			await shardClient.start(this.token);
			return;
		}

		if (this.handleConcurrency) {
			const sessions = await this.fetchSessions();

			this.concurrencyServer = new ConcurrencyServer(this, sessions.session_start_limit.max_concurrency);

			const info = await this.concurrencyServer.start();

			this.emit(
				LibraryEvents.DEBUG,
				`Handle concurrency is currently enabled! =>\n  Server is currently bound to:\n    Address: ${info.address}:${info.port}\n    Concurrency: ${sessions.session_start_limit.max_concurrency}`,
			);
		}

		this.clusterCount ??= Os.availableParallelism();

		if (this.shardCount == null) {
			const sessions = await this.fetchSessions();
			this.shardCount = sessions.shards;
		}

		this.clusterCount = Math.min(Number(this.clusterCount), Number(this.shardCount));

		this.emit(LibraryEvents.DEBUG, `Starting ${this.shardCount} websocket shards across ${this.clusterCount} clusters`);

		const shards = Array.from({ length: Number(this.shardCount) }, (_, i) => i);
		const chunkSize = Math.round(Number(this.shardCount) / this.clusterCount);
		const chunks = Chunk(shards, chunkSize);

		Cluster.setupPrimary({
			serialization: "json",
			...this.clusterSettings,
		});

		for (const [id, shardIds] of chunks.entries()) {
			const cluster = new ClusterManager({
				id,
				shards: shardIds,
				manager: this,
			});

			this.clusters.set(id, cluster);
		}

		await this.addToSpawnQueue(...this.clusters.values());
	}

	/**
	 * Restart specified cluster if this instance is the primary process
	 *
	 * @param clusterId Id of cluster to restart
	 * @returns A promise that resolves to void
	 */
	public async restart(clusterId: number): Promise<void> {
		if (!Cluster.isPrimary) {
			return;
		}

		const cluster = this.clusters.get(clusterId);
		if (!cluster) {
			throw new Error(`Invalid clusterId, or a cluster with this id doesn't exist, received id ${clusterId}`);
		}

		await this.addToSpawnQueue(cluster);
	}

	/**
	 * Restart all clusters if this instance is the primary process
	 *
	 * @returns A promise that resolves to void
	 */
	public async restartAll(): Promise<void> {
		if (!Cluster.isPrimary) {
			return;
		}

		await this.addToSpawnQueue(...this.clusters.values());
	}

	/**
	 * Sends a message to a specific cluster
	 *
	 * @returns A promise that resolves to undefined or an unknown value depending on how you reply to it
	 */
	public async send(id: number, sendable: Sendable): Promise<unknown | undefined> {
		const cluster = this.clusters.get(id);
		if (!cluster) {
			throw new Error("Invalid cluster id provided");
		}

		let abortableData: AbortableData | undefined;
		if (this.ipcTimeout !== Infinity && sendable.repliable) {
			abortableData = MakeAbortableRequest(this.ipcTimeout);
		}

		const transportable: Transportable = {
			content: sendable.content,
			repliable: sendable.repliable,
		};

		if (abortableData) {
			transportable.signal = abortableData.controller.signal;
		}

		try {
			return await cluster.ipc.send(transportable);
		} finally {
			if (abortableData) {
				clearTimeout(abortableData.timeout);
			}
		}
	}

	/**
	 * Sends a message on all clusters
	 *
	 * @returns An array of promise that resolves to undefined or an unknown value depending on how you reply to it
	 */
	public async broadcast(sendable: Sendable): Promise<unknown[]> {
		const clusters = [...this.clusters.keys()];
		return Promise.all(clusters.map(async (id) => this.send(id, sendable)));
	}

	/**
	 * Reconfigures to launch more shards / clusters without killing the existing processes if possible to avoid big downtimes
	 *
	 * @remarks Never execute restart() or restartAll() during this process or else you will double restart that cluster / all clusters
	 * @returns A promise that resolves to void
	 */
	public async reconfigure(options: ReconfigureOptions = {}): Promise<void> {
		if (!Cluster.isPrimary || this.isBusy) {
			return;
		}

		if (!options.shards) {
			const sessions = await this.fetchSessions();
			this.shardCount = sessions.shards;
		}

		this.emit(LibraryEvents.DEBUG, `Reconfigured Indomitable to use ${this.shardCount} shard(s)`);

		const oldClusterCount = this.clusters.size;
		this.clusterCount = options.clusters ?? oldClusterCount;

		const chunks = Chunk(
			Array.from({ length: Number(this.shardCount) }, (_, i) => i),
			Math.round(Number(this.shardCount) / this.clusterCount),
		);

		if (oldClusterCount < this.clusterCount) {
			for (let id = oldClusterCount; id < this.clusterCount; id++) {
				this.clusters.set(
					id,
					new ClusterManager({
						id,
						shards: [],
						manager: this,
					}),
				);
			}
		} else if (oldClusterCount > this.clusterCount) {
			for (const id of [...this.clusters.keys()].reverse().slice(0, oldClusterCount - this.clusterCount)) {
				this.clusters.get(id)!.destroy();
				this.clusters.delete(id);
			}
		}

		this.emit(
			LibraryEvents.DEBUG,
			`Reconfigured Indomitable to use ${this.clusterCount} cluster(s) from ${oldClusterCount} cluster(s)`,
		);

		for (const [index, cluster] of this.clusters.entries()) {
			cluster.shards = chunks[index]!;
		}

		this.emit(LibraryEvents.DEBUG, "Clusters shard ranges reconfigured, moving to spawn queue");

		await this.addToSpawnQueue(...this.clusters.values());
	}

	/**
	 * Adds a cluster to spawn queue
	 *
	 * @internal
	 */
	public async addToSpawnQueue(...clusters: ClusterManager[]) {
		if (!Cluster.isPrimary) {
			return undefined;
		}

		for (const cluster of clusters) {
			if (this.spawnQueue.some((manager) => manager.id === cluster.id)) {
				continue;
			}

			this.spawnQueue.push(cluster);
		}

		return this.processQueue();
	}

	/**
	 * Destroys the client on a cluster
	 *
	 * @internal
	 */
	private async destroyClusterClient(id: number): Promise<void> {
		const content: InternalOpsData = {
			op: InternalOps.DESTROY_CLIENT,
			data: {},
			internal: true,
		};
		await this.send(id, { content, repliable: true });
	}

	/**
	 * Processes the cluster queue
	 *
	 * @internal
	 */
	private async processQueue(): Promise<void> {
		if (this.isBusy || this.spawnQueue.length === 0) {
			return;
		}

		this.busy = true;

		this.emit(
			LibraryEvents.DEBUG,
			`Processing spawn queue with ${this.spawnQueue.length} clusters waiting to be spawned....`,
		);

		const queue = this.spawnQueue.splice(0, this.spawnQueue.length);

		for (const cluster of queue) {
			try {
				if (cluster.started) {
					await this.destroyClusterClient(cluster.id);
					await cluster.respawn();
				} else {
					await cluster.spawn();
				}
			} catch (error: unknown) {
				this.emit(LibraryEvents.ERROR, error as Error);

				if (this.autoRestart) {
					this.emit(
						LibraryEvents.DEBUG,
						`Failed to spawn Cluster ${cluster.id} containing [${cluster.shards.join(", ")}] shard(s). Re-queuing`,
					);

					this.spawnQueue.push(cluster);
				}
			}
		}

		this.busy = false;

		this.emit(LibraryEvents.DEBUG, "Cluster Queue Empty! Clusters done booting up");
	}
}
