import { ChildProcess, Serializable } from 'node:child_process';
import { randomUUID } from 'crypto';
import { BaseIpc } from './BaseIpc.js';
import { Indomitable } from '../Indomitable';
import { RawIpcMessage, RawIpcMessageType, Transportable } from '../Util';

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

    protected handleMessage(data: RawIpcMessage): boolean|void {}
}
