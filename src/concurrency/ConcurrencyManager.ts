import { ExtendedMap } from './ExtendedMap';
import { AsyncQueue } from './AsyncQueue';
import { Delay } from '../Util';

/**
 * Based on Discord.JS Simple Identify Throttler, for use of Indomitable
 */
export class ConcurrencyManager {
    private readonly queues: ExtendedMap;
    private readonly signals: Map<number, AbortController>;
    private readonly concurrency: number;
    constructor(concurrency: number) {
        this.queues = new ExtendedMap();
        this.signals = new Map();
        this.concurrency = concurrency;
    }

    /**
     * Method to try and acquire a lock for identify
     */
    public async waitForIdentify(shardId: number): Promise<void> {
        try {
            const abort = this.signals.get(shardId) || new AbortController();

            if (!this.signals.has(shardId)) this.signals.set(shardId, abort);

            const key = shardId % this.concurrency;
            const state = this.queues.ensure(key, () => {
                return {
                    queue: new AsyncQueue(),
                    resets: Number.POSITIVE_INFINITY
                };
            });
            
            try {
                await state.queue.wait({ signal: abort.signal });

                const difference = state.resets - Date.now();

                if (difference <= 5000) {
                    const time = difference + Math.random() * 1500;
                    await Delay(time);
                }

                state.resets = Date.now() + 5_000;
            } finally {
                state.queue.shift();
            }
        } finally {
            this.signals.delete(shardId);
        }
    }

    /**
     * Aborts an acquire lock request
     */
    public abortIdentify(shardId: number): void {
        const signal = this.signals.get(shardId);
        signal?.abort(`Shard ${shardId} aborted the identify request`);
    }
}
