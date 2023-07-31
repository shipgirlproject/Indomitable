import EventEmitter from 'node:events';
import { parentPort } from 'worker_threads';
import { WebSocketShard } from '@discordjs/ws';
import { BaseIpc } from './BaseIpc';
import {
    MainStrategyData,
    MainStrategyOps,
    Message,
    RawIpcMessage,
} from '../Util';

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

    protected async handleMessage(message: Message): Promise<void> {
        const content = message.content as MainStrategyData;
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
    }
}
