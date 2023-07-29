import EventEmitter from 'node:events';
import { BaseIpc } from './BaseIpc';
import { MainStrategyData, MainStrategyOps, Message, RawIpcMessage, RawIpcMessageType } from '../Util';
import { parentPort } from 'worker_threads';
import { WebSocketShard } from '@discordjs/ws';

export class ThreadStrategyWorker extends BaseIpc {
    private shard: WebSocketShard|undefined;
    constructor() {
        // @ts-expect-error: Indomitable will not be used in the thread process
        super(new EventEmitter());
        parentPort!.on('message', message => this.handleRawResponse(message, () => null));
    }

    public build(shard: WebSocketShard): void {
        if (!this.shard) this.shard = shard;
    }

    protected available(): boolean {
        return !!parentPort;
    }

    protected sendData(data: RawIpcMessage) {
        return parentPort!.postMessage(data);
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
        const content = data.content as MainStrategyData;
        try {
            if (!this.shard) throw new Error('Shard isn\'t initialized yet');
            switch(content.op) {
                case MainStrategyOps.CONNECT:
                    await this.shard.connect();
                    message.reply(null);
                    break;
                case MainStrategyOps.DESTROY:
                    await this.shard.destroy(content.data || {});
                    message.reply(null);
                    break;
                case MainStrategyOps.SEND:
                    await this.shard.send(content.data || {});
                    message.reply(null);
                    break;
                case MainStrategyOps.RECONNECT:
                    await this.shard.destroy(content.data);
                    message.reply(null);
                    break;
                case MainStrategyOps.STATUS:
                    message.reply(this.shard.status);
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
