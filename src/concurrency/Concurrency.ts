import { ShardClientUtil } from '../client/ShardClientUtil';
import { ClientEvents, InternalEvents } from '../Util';

export class Concurrency {
    private shard: ShardClientUtil;
    constructor(shard: ShardClientUtil) {
        this.shard = shard;
    }

    public async waitForIdentify(shardId: number, signal: AbortSignal): Promise<void> {
        const content: InternalEvents = {
            op: ClientEvents.REQUEST_IDENTIFY,
            data: { shardId },
            internal: true
        };
        const listener = () => this.abortIdentify(shardId).catch(() => null);
        try {
            signal.addEventListener('abort', listener);
            await this.shard.send({ content, repliable: true });
        } finally {
            signal.removeEventListener('abort', listener);
        }
    }

    private async abortIdentify(shardId: number): Promise<void> {
        const content: InternalEvents = {
            op: ClientEvents.CANCEL_IDENTIFY,
            data: { shardId },
            internal: true
        };
        await this.shard.send({ content, repliable: false });
    }
}
