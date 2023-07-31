import EventEmitter from 'node:events';
import { Serializable } from 'node:child_process';
import { randomUUID } from 'crypto';
import { Indomitable } from '../Indomitable.js';
import {
    InternalAbortSignal,
    InternalPromise,
    IpcErrorData,
    LibraryEvents,
    Message,
    RawIpcMessage,
    RawIpcMessageType,
    SavePromiseOptions,
    Transportable
} from '../Util.js';

/**
 * Base class where primary and worker ipc inherits
 */
export abstract class BaseIpc {
    public readonly manager: Indomitable|EventEmitter;
    protected readonly promises: Map<string, InternalPromise>;
    protected constructor(manager: Indomitable|EventEmitter) {
        this.manager = manager;
        this.promises = new Map();
    }

    /**
     * Number of promises pending to be resolved
     */
    public get pendingPromises(): number {
        return this.promises.size;
    }

    /**
     * Rejects all the pending promises
     */
    public flushPromises(reason: string): void {
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
     * Raw send method without abort controller handling
     * @param transportable Data to send
     */
    public send(transportable: Transportable): Promise<unknown|undefined> {
        return new Promise((resolve, reject) => {
            if (!this.available()) {
                this.manager.emit(LibraryEvents.DEBUG, 'IPC tried to send a message, but the ipc communication is not yet ready');
                return resolve(undefined);
            }
            const repliable = transportable.repliable || false;
            const id = repliable ? randomUUID() : null;
            const data: RawIpcMessage = {
                id,
                content: transportable.content,
                internal: true,
                type: RawIpcMessageType.MESSAGE
            };
            this.sendData(data);
            if (!id) return resolve(undefined);
            this.waitForPromise({ id, resolve, reject, signal: transportable.signal });
        });
    }

    /**
     * Taps into message event of worker or primary process to handle ipc communication
     * @internal
     */
    public async handleRawResponse(data: Serializable, errorCallback: (error: unknown) => any): Promise<boolean|void> {
        try {
            this.manager.emit(LibraryEvents.RAW, data);
            if (!(data as any).internal) return;
            switch((data as RawIpcMessage).type) {
                case RawIpcMessageType.MESSAGE:
                    return await this.handleUnparsedMessage(data as RawIpcMessage);
                case RawIpcMessageType.RESPONSE:
                case RawIpcMessageType.ERROR:
                    return this.handlePromise(data as RawIpcMessage);
            }
        } catch (error: unknown) {
            errorCallback(error);
        }
    }

    protected waitForPromise(options: SavePromiseOptions): void {
        let controller: InternalAbortSignal|undefined;
        if (options.signal) {
            const listener = () => {
                this.promises.delete(options.id);
                options.reject(new Error('This operation is aborted'));
            };
            controller = {
                listener,
                signal: options.signal
            };
            controller.signal.addEventListener('abort', listener);
        }
        this.promises.set(options.id, { resolve: options.resolve, reject: options.reject, controller } as InternalPromise);
    }

    private handlePromise(data: RawIpcMessage): void {
        const id = data.id as string;
        const promise = this.promises.get(id);
        if (!promise) return;
        this.promises.delete(id);
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

    private async handleUnparsedMessage(data: RawIpcMessage): Promise<void> {
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
        const message: Message = {
            repliable: !!data.id,
            content: data.content,
            reply
        };
        if (!data.content.internal)
            return this.emitMessage(message);
        try {
            await this.handleMessage(message);
        } catch (error: any) {
            if (!message.repliable) return;
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

    protected emitMessage(message: Message): void {
        this.manager.emit(LibraryEvents.MESSAGE, message);
    }

    protected abstract available(): boolean;
    protected abstract sendData(data: RawIpcMessage): void;
    protected abstract handleMessage(message: Message): Promise<void>;
}
