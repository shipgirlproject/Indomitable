import { Serializable } from 'node:child_process';
import { BaseIpc } from './BaseIpc.js';
import { Indomitable } from '../Indomitable';
import { Message, RawIpcMessage } from '../Util';

/**
 * Basic worker ipc class, basic child process ipc handler
 */
export class BaseWorker extends BaseIpc {
    constructor(manager: Indomitable) {
        super(manager);
        process.on('message',
            data => this.handleRawResponse(data as Serializable, () => null)
        );
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
