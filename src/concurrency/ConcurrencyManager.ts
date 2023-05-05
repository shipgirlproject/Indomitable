import { SimpleIdentifyThrottler } from '@discordjs/ws';

/**
 * A wrapper for @discordjs/ws to work exclusively with Indomitable's dynamic concurrency with support for abort controller
 */

export class ConcurrencyManager {
    private readonly throttler: SimpleIdentifyThrottler;
    private readonly signals: Map<number, AbortController>;
    constructor(concurrency: number) {
        this.throttler = new SimpleIdentifyThrottler(concurrency);
        this.signals = new Map();
    }

    public async waitForIdentify(shardId: number): Promise<void> {
        try {
            let abort = this.signals.get(shardId);
            if (!abort) {
                abort = new AbortController();
                this.signals.set(shardId, abort);
            }
            await this.throttler.waitForIdentify(shardId, abort.signal);
        } finally {
            this.signals.delete(shardId);
        }
    }

    public abortIdentify(shardId: number): void {
        const signal = this.signals.get(shardId);
        signal?.abort();
    }
}
