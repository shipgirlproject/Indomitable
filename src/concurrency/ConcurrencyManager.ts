import { Collection } from '@discordjs/collection';
import { AsyncQueue } from '@sapphire/async-queue';
import { Delay } from '../Util';

/**
 * Based on @discordjs/ws simple concurrency handling, with things to make it work with indomitable
 */

export interface Bucket {
    queue: AsyncQueue;
    resetsAt: number;
}

export class ConcurrencyManager {
    private readonly concurrency: number;
    private readonly buckets: Collection<number, Bucket>;
    private readonly signals: Collection<number, AbortController>;
    constructor(concurrency: number) {
        this.concurrency = concurrency;
        this.buckets = new Collection();
        this.signals = new Collection();
    }

    public async waitForIdentify(shardId: number): Promise<void> {
        const key = shardId % this.concurrency;
        const bucket = this.buckets.ensure(key, () => ({ queue: new AsyncQueue(), resetsAt: Infinity }));
        const controller = this.signals.ensure(key, () => new AbortController());
        try {
            await bucket.queue.wait({ signal: controller.signal });
            const diff = bucket.resetsAt - Date.now();
            if (diff <= 5000) {
                const time = diff + 500;
                await Delay(time);
            }
            bucket.resetsAt = Date.now() + 5000;
        } finally {
            this.signals.delete(shardId);
            bucket.queue.shift();
        }
    }

    public abortIdentify(shardId: number): void {
        const signal = this.signals.get(shardId);
        signal?.abort();
    }
}
