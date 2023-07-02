import { Serializable } from 'node:child_process';
import { Indomitable } from '../Indomitable.js';
import {
    InternalAbortSignal,
    InternalPromise,
    LibraryEvents,
    RawIpcMessage,
    RawIpcMessageType,
    SavePromiseOptions
} from '../Util.js';

/**
 * Base class where primary and worker ipc inherits
 */
export abstract class BaseIpc {
    public readonly manager: Indomitable;
    protected readonly promises: Map<string, InternalPromise>;
    protected constructor(manager: Indomitable) {
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
     * Taps into message event of worker or primary process to handle ipc communication
     * @internal
     */
    public async handleRawResponse(data: Serializable, errorCallback: (error: unknown) => any): Promise<boolean|void> {
        try {
            this.manager.emit(LibraryEvents.RAW, data);
            if (!(data as any).internal)
                return this.manager.emit(LibraryEvents.MESSAGE, data);
            switch((data as RawIpcMessage).type) {
            case RawIpcMessageType.MESSAGE:
                return await this.handleMessage(data as RawIpcMessage);
            case RawIpcMessageType.RESPONSE:
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
        if (data.content?.internal && data.content?.error) {
            const error = new Error(data.content.reason || 'Unknown error reason');
            error.stack = data.content.stack;
            error.name = data.content.name;
            return promise.reject(error);
        }
        promise.resolve(data.content);
    }

    protected abstract handleMessage(data: RawIpcMessage): Promise<boolean|void>|boolean|void;
}
