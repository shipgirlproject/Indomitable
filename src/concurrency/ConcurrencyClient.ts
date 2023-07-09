import { ShardClientUtil } from '../client/ShardClientUtil';
import { ClientEvents, InternalEvents } from '../Util';

/**
 * Internal class that is passed to @discordjs/ws to handle concurrency
 */
export class ConcurrencyClient {
    private shard: ShardClientUtil;
    constructor(shard: ShardClientUtil) {
        this.shard = shard;
    }

    /**
     * Method to try and acquire a lock for identify
     */
    public async waitForIdentify(shardId: number, signal: AbortSignal): Promise<void> {
        const content: InternalEvents = {
            op: ClientEvents.REQUEST_IDENTIFY,
            data: { shardId },
            internal: true
        };
        const listener = () => this.abortIdentify(shardId);
        try {
            signal.addEventListener('abort', listener);
            await this.shard.send({ content, repliable: true });
        } finally {
            signal.removeEventListener('abort', listener);
        }
    }

    /**
     * Aborts an acquire lock request
     */
    private abortIdentify(shardId: number): void {
        const content: InternalEvents = {
            op: ClientEvents.CANCEL_IDENTIFY,
            data: { shardId },
            internal: true
        };
        this.shard
            .send({ content, repliable: false })
            .catch(() => null);
    }
}
