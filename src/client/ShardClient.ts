import type { Client, ClientOptions as DiscordJsClientOptions } from "discord.js";
import type { Indomitable } from "../Indomitable.js";
import type { ClientEventData } from "../Util.js";
import { EnvProcessData, ClientEvents } from "../Util.js";
import { ConcurrencyClient } from "../concurrency/ConcurrencyClient.js";
import { ShardClientUtil } from "./ShardClientUtil.js";

export interface InternalEvents {
	data: {
		clusterId: number;
		event?: CloseEvent;
		ipcId?: string;
		replayed?: number;
		shardId?: number;
	};
	op: ClientEvents;
}

/**
 * A little helper on binding Indomitable to Discord.JS client
 */
export class ShardClient {
	private readonly client: Client;

	private readonly clusterId: number;

	private readonly concurrency?: ConcurrencyClient;

	public constructor(private readonly manager: Indomitable) {
		const base = (this.manager.clientOptions as DiscordJsClientOptions) ?? {};

		const clientOptions: DiscordJsClientOptions = {
			...base,
			shards: EnvProcessData.shardIds,
			shardCount: EnvProcessData.shardCount,
		};

		if (this.manager.handleConcurrency) {
			this.concurrency = new ConcurrencyClient();

			clientOptions.ws ??= {};
			clientOptions.ws.buildIdentifyThrottler = async () => this.concurrency!;
		}

		this.client = new this.manager.client(clientOptions);

		// @ts-expect-error override discord.js shard util
		this.client.shard = new ShardClientUtil(this.client, this.manager);

		this.clusterId = Number(EnvProcessData.clusterId);
	}

	public async start(token: string): Promise<void> {
		if (this.concurrency) {
			this.client.emit("debug", "[Indomitable]: concurrency enabled, testing identify server...");

			const start = await this.concurrency.checkServer();

			this.client.emit("debug", `[Indomitable]: identify server OK (${Math.round(Date.now() - start)}ms)`);
		}

		this.client.once("ready", () => this.send({ op: ClientEvents.READY, data: { clusterId: this.clusterId } }));

		this.client.on("shardReady", (shardId: number) =>
			this.send({
				op: ClientEvents.SHARD_READY,
				data: { clusterId: this.clusterId, shardId },
			}),
		);

		this.client.on("shardReconnecting", (shardId: number) =>
			this.send({
				op: ClientEvents.SHARD_RECONNECT,
				data: { clusterId: this.clusterId, shardId },
			}),
		);

		this.client.on("shardResume", (shardId: number, replayed: number) =>
			this.send({
				op: ClientEvents.SHARD_RESUME,
				data: { clusterId: this.clusterId, shardId, replayed },
			}),
		);

		// @ts-expect-error discord.js typing mismatch
		this.client.on("shardDisconnect", (event: CloseEvent, shardId: number) =>
			this.send({
				op: ClientEvents.SHARD_DISCONNECT,
				data: { clusterId: this.clusterId, shardId, event },
			}),
		);

		await this.client.login(token);
	}

	private send(packet: InternalEvents): void {
		// @ts-expect-error: our own class
		const shardUtil = this.client.shard as ShardClientUtil;

		const payload: ClientEventData = {
			...packet,
			internal: true,
		};

		shardUtil
			.send({ content: payload, repliable: false })
			// eslint-disable-next-line promise/prefer-await-to-callbacks, promise/prefer-await-to-then
			.catch((error: unknown) => this.client.emit(ClientEvents.ERROR, error as Error));
	}
}
