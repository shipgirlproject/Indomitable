import { FetchingStrategyOptions, IContextFetchingStrategy, SessionInfo, WebSocketShardEvents } from '@discordjs/ws';
import { ThreadStrategyWorker } from '../ipc/ThreadStrategyWorker';
import { ThreadStrategyData, ThreadStrategyOps } from '../Util';

export class IndomitableFetchingStrategy implements IContextFetchingStrategy {
    private readonly ipc: ThreadStrategyWorker;
    public readonly options: FetchingStrategyOptions;
    constructor(ipc: ThreadStrategyWorker, options: FetchingStrategyOptions) {
        this.ipc = ipc;
        this.options = options;
    }

    public async retrieveSessionInfo(shardId: number): Promise<SessionInfo | null> {
        const content: ThreadStrategyData = {
            op: ThreadStrategyOps.RETRIEVE_SESSION,
            event: WebSocketShardEvents.Ready,
            data: { shardId },
            shardId: shardId,
            internal: true
        };
        return await this.ipc.send({ content, repliable: true }) as SessionInfo;
    }

    public async updateSessionInfo(shardId: number, sessionInfo: SessionInfo | null): Promise<void> {
        const content: ThreadStrategyData = {
            op: ThreadStrategyOps.UPDATE_SESSION,
            event: WebSocketShardEvents.Ready,
            data: { shardId, sessionInfo },
            shardId: shardId,
            internal: true
        };
        await this.ipc.send({ content });
    }

    public async waitForIdentify(shardId: number, signal: AbortSignal): Promise<void> {
        const content: ThreadStrategyData = {
            op: ThreadStrategyOps.REQUEST_IDENTIFY,
            event: WebSocketShardEvents.Ready,
            data: { shardId },
            shardId: shardId,
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

    private abortIdentify(shardId: number): void {
        const content: ThreadStrategyData = {
            op: ThreadStrategyOps.CANCEL_IDENTIFY,
            event: WebSocketShardEvents.Ready,
            data: { shardId },
            shardId: shardId,
            internal: true
        };
        this.ipc
            .send({ content, repliable: false })
            .catch(() => null);
    }
}
