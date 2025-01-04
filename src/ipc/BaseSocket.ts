import type { Socket } from 'node:net';
import {
    InternalAbortSignal,
    InternalPromise,
    IpcErrorData,
    RawIpcMessage,
    RawIpcMessageType,
    SavePromiseOptions,
    Transportable
} from '../Util';
import { randomUUID } from 'node:crypto';

export class Message {
    public readonly content: any;
    private readonly socket: Socket;
    private readonly nonce: string;
    private readonly reply: boolean;

    constructor(socket: Socket, data: RawIpcMessage) {
        this.socket = socket;
        this.nonce = data.nonce;
        this.reply = data.reply;
        this.content = data.content;
    }

    get shouldReply(): boolean {
        return !this.socket.destroyed && this.reply;
    }

    public send(content: any): void {
        if (!this.shouldReply) return;
        const response: RawIpcMessage = {
            nonce: this.nonce,
            reply: false,
            type: RawIpcMessageType.RESPONSE,
            internal: true,
            content
        };
        this.socket.write(JSON.stringify(response));
    }

    public error(error: Error): void {
        if (!this.shouldReply) return;
        const response: RawIpcMessage = {
            nonce: this.nonce,
            content: error,
            reply: false,
            type: RawIpcMessageType.ERROR,
            internal: true
        };
        this.socket.write(JSON.stringify(response));
    }
}

export abstract class BaseSocket {
    protected readonly socket: Socket;
    protected readonly promises: Map<string, InternalPromise>;

    protected constructor(socket: Socket) {
        this.socket = socket;
        this.promises = new Map();

        this.socket
            .on('data', buffer => this.onData(buffer))
            .on('error', error => this.handleError(error))
            .on('close', () => this.onClose());
    }

    /**
     * Raw send method without abort controller handling
     * @param transportable Data to send
     */
    public send(transportable: Transportable): Promise<unknown | undefined> {
        return new Promise((resolve, reject) => {
            if (this.socket.destroyed) {
                return resolve(undefined);
            }
            const nonce = randomUUID();
            const data: RawIpcMessage = {
                nonce,
                content: transportable.content,
                reply: transportable.reply || false,
                type: RawIpcMessageType.MESSAGE,
                internal: true
            };
            this.socket.write(JSON.stringify(data));
            if (!data.reply) return resolve(undefined);
            this.waitForPromise({nonce, resolve, reject, signal: transportable.signal});
        });
    }

    protected abstract handleMessage(message: Message): Promise<void>;

    protected abstract handleError(error: Error): void;

    protected abstract handleClose(): void;

    /**
     * Rejects all the pending promises
     */
    private flushPending(reason: string): void {
        const error = new Error(reason);
        for (const promise of this.promises.values()) {
            if (promise.controller) {
                promise.controller.signal.removeEventListener('abort', promise.controller.listener);
            }
            promise.reject(error);
        }
        this.promises.clear();
    }

    /**
     * Taps into message event of worker or primary process to handle ipc communication
     * @internal
     */
    private onData(buffer: Buffer): void {
        const data = JSON.parse(buffer.toString());

        if (typeof data.internal !== 'boolean' && !data.internal) return;

        switch (data.type) {
            case RawIpcMessageType.MESSAGE:
                return void this
                    .handleMessage(new Message(this.socket, data))
                    .catch(() => null);
            case RawIpcMessageType.RESPONSE:
            case RawIpcMessageType.ERROR:
                return this.handlePromise(data);
        }
    }

    private onClose(): void {
        this.flushPending('Connection closed');
        this.handleClose();
    }

    private waitForPromise(options: SavePromiseOptions): void {
        let controller: InternalAbortSignal | undefined;

        if (options.signal) {

            const listener = () => {
                this.promises.delete(options.nonce);
                options.reject(new Error('This operation is aborted'));
            };

            controller = {
                listener,
                signal: options.signal
            };
            controller.signal.addEventListener('abort', listener);
        }

        this.promises.set(options.nonce, {
            resolve: options.resolve,
            reject: options.reject,
            controller
        } as InternalPromise);
    }

    private handlePromise(data: RawIpcMessage): void {
        const promise = this.promises.get(data.nonce);
        if (!promise) return;

        this.promises.delete(data.nonce);

        if (promise.controller) {
            promise.controller.signal.removeEventListener('abort', promise.controller.listener);
        }

        if (data.type === RawIpcMessageType.ERROR) {
            const content = data.content as IpcErrorData;
            const error = new Error(content.reason);
            error.stack = content.stack;
            error.name = content.name;
            promise.reject(error);
            return;
        }

        promise.resolve(data.content);
    }
}