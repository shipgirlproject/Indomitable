import EventEmitter from 'node:events';
import { Worker } from 'node:worker_threads';
import { BaseIpc } from './BaseIpc';
import {
    InternalOps,
    InternalOpsData,
    Message,
    RawIpcMessage,
    RawIpcMessageType,
    ThreadStrategyData,
    ThreadStrategyOps
} from '../Util';
import { IndomitableStrategy } from '../strategy/IndomitableStrategy';

export class MainStrategyWorker extends BaseIpc {
    public readonly id: number;
    public readonly thread: Worker;
    public readonly strategy: IndomitableStrategy;
    constructor(id: number, thread: Worker, strategy: IndomitableStrategy) {
        // @ts-expect-error: Indomitable will not be used in this class
        super(new EventEmitter());
        this.id = id;
        this.thread = thread;
        this.strategy = strategy;
    }

    protected available(): boolean {
        return true;
    }

    protected sendData(data: RawIpcMessage) {
        return this.thread.postMessage(data);
    }

    protected async handleMessage(data: RawIpcMessage): Promise<boolean | void> {
        const reply = (content: any) => {
            if (!data.id) return;
            const response: RawIpcMessage = {
                id: data.id,
                content,
                internal: true,
                type: RawIpcMessageType.RESPONSE
            };
            this.sendData(response);
        };
        if (!data.internal) return;
        const message: Message = {
            repliable: !!data.id,
            content: data.content,
            reply
        };
        const content = data.content as ThreadStrategyData;
        try {
            switch(content.op) {
                case ThreadStrategyOps.SHARD_EVENT:
                    this.strategy.manager.emit(content.event, { ...content.data, shardId: content.shardId });
                    break;
                case ThreadStrategyOps.REQUEST_IDENTIFY: {
                    const request: InternalOpsData = {
                        op: InternalOps.REQUEST_IDENTIFY,
                        data: { shardId: content.data.shardId },
                        internal: true
                    };
                    await this.strategy.ipc.send({ content: request, repliable: true });
                    message.reply(null);
                    break;
                }
                case ThreadStrategyOps.CANCEL_IDENTIFY: {
                    const request: InternalOpsData = {
                        op: InternalOps.CANCEL_IDENTIFY,
                        data: { shardId: content.data.shardId },
                        internal: true
                    };
                    await this.strategy.ipc.send({ content: request });
                    message.reply(null);
                    break;
                }
                case ThreadStrategyOps.RETRIEVE_SESSION: {
                    const session = await this.strategy.manager.options.retrieveSessionInfo(content.data.shardId);
                    message.reply(session);
                    break;
                }
                case ThreadStrategyOps.UPDATE_SESSION:
                    await this.strategy.manager.options.updateSessionInfo(content.data.shardId, content.data.sessionInfo);
                    break;
            }
        } catch (error: any) {
            if (!message.repliable) throw error as Error;
            const response: RawIpcMessage = {
                id: data.id,
                content: {
                    name: error.name,
                    reason: error.reason,
                    stack: error.stack
                },
                internal: true,
                type: RawIpcMessageType.ERROR
            };
            this.sendData(response);
        }
    }
}
