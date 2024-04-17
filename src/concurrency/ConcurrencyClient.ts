import { InternalOps, InternalOpsData } from '../Util';
import { BaseWorker } from '../ipc/BaseWorker';

/**
 * Internal class that is passed to @discordjs/ws to handle concurrency
 */
export class ConcurrencyClient {
    private ipc: BaseWorker;
    constructor(ipc: BaseWorker) {
        this.ipc = ipc;
    }

    /**
     * Method to try and acquire a lock for identify
     */
    public async waitForIdentify(shardId: number, signal: AbortSignal): Promise<void> {
        const content: InternalOpsData = {
            op: InternalOps.REQUEST_IDENTIFY,
            data: { shardId },
            internal: true
        };
        const listener = () => this.abortIdentify(shardId);
        try {
            signal.addEventListener('abort', listener);
            await this.ipc.send({ content, repliable: true });
        } finally {
            signal.removeEventListener('abort', listener);
        }
    }

    /**
     * Aborts an acquire lock request
     */
    private abortIdentify(shardId: number): void {
        const content: InternalOpsData = {
            op: InternalOps.CANCEL_IDENTIFY,
            data: { shardId },
            internal: true
        };
        this.ipc
            .send({ content, repliable: false })
            .catch(() => null);
    }
}