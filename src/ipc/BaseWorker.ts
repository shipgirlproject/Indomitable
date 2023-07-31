import EventEmitter from 'node:events';
import { Serializable } from 'node:child_process';
import { Indomitable } from '../Indomitable';
import { BaseIpc } from './BaseIpc.js';
import { Message, RawIpcMessage } from '../Util';

/**
 * Basic worker ipc class, basic child process ipc handler
 */
export class BaseWorker extends BaseIpc {
    constructor(manager: Indomitable | EventEmitter = new EventEmitter()) {
        super(manager);
        process
            .on('message', data => this.handleRawResponse(data as Serializable, () => null));
    }

    protected available(): boolean {
        return !!process.send;
    }

    protected sendData(data: RawIpcMessage): void {
        process.send!(data);
    }

    protected handleMessage(message: Message): Promise<void> {
        return Promise.resolve();
    }
}
