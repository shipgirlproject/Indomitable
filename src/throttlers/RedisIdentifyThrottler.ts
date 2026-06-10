import type { IIdentifyThrottler } from "@discordjs/ws";
import type Redis from "ioredis";
import { createLock, IoredisAdapter } from "redlock-universal";

export interface RedisIdentifyThrottlerOptions {
	maxConcurrency: number;
	redis: Redis;
	retryDelay?: number;
}

export class RedisIdentifyThrottler implements IIdentifyThrottler {
	private readonly adapter: IoredisAdapter;

	private readonly maxConcurrency: number;

	private readonly retryDelay: number;

	public constructor(options: RedisIdentifyThrottlerOptions) {
		this.adapter = new IoredisAdapter(options.redis);
		this.maxConcurrency = options.maxConcurrency;
		this.retryDelay = options.retryDelay ?? 5_500;
	}

	public async waitForIdentify(shardId: number): Promise<void> {
		const key = shardId % this.maxConcurrency;
		const lock = createLock({
			adapter: this.adapter,
			key: `indomitable:identify:shard:${key}`,
			retryDelay: this.retryDelay,
			ttl: 6_000,
		});

		await lock.acquire();
	}
}
