import { Serializable } from 'node:child_process';
import { randomUUID } from 'crypto';
import { Indomitable } from '../Indomitable';
import { ClusterManager } from '../ClusterManager';
import { Message, LibraryEvents, Transportable, InternalEvents, ClientEvents, RawIpcMessage, RawIpcMessageType, InternalPromise, InternalError, InternalAbortSignal } from '../Util';

export class Main {
    public readonly cluster: ClusterManager;
    private readonly promises: Map<string, InternalPromise>;
    constructor(cluster: ClusterManager) {
        this.cluster = cluster;
        this.promises = new Map();
    }

    public get manager(): Indomitable {
        return this.cluster.manager;
    }

    public get pending(): number {
        return this.promises.size;
    }

    public flush(reason: string): void {
        const error = new Error(reason);
        for (const promise of this.promises.values()) {
            if (promise.controller) {
                promise.controller.signal.removeEventListener('abort', promise.controller.listener);
            }
            promise.reject(error);
        }
        this.promises.clear();
    }

    public send(transportable: Transportable): Promise<any|undefined> {
        return new Promise((resolve, reject) => {
            if (!this.cluster.worker) {
                this.manager.emit(LibraryEvents.DEBUG, `Tried to send message to cluster ${this.cluster.id} but this worker is yet to be available`);
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
            this.cluster.worker.send(data);
            if (!id) return resolve(undefined);
            let controller: InternalAbortSignal|undefined;
            if (transportable.signal) {
                const listener = () => {
                    this.promises.delete(id);
                    reject(new Error('This operation is aborted'));
                };
                controller = {
                    listener,
                    signal: transportable.signal
                };
                controller.signal.addEventListener('abort', listener);
            }
            this.promises.set(id, { resolve, reject, controller } as InternalPromise);
        });
    }

    public async handle(data: Serializable): Promise<boolean|void> {
        try {
            if (!(data as any).internal)
                return this.manager.emit(LibraryEvents.MESSAGE, data);
            switch((data as RawIpcMessage).type) {
            case RawIpcMessageType.MESSAGE:
                return this.message(data as RawIpcMessage);
            case RawIpcMessageType.RESPONSE:
                return this.promise(data as RawIpcMessage);
            }
        } catch (error: unknown) {
            this.manager.emit(LibraryEvents.ERROR, error as Error);
        }
    }

    private promise(data: RawIpcMessage): void {
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

    private async message(data: RawIpcMessage): Promise<boolean|void> {
        const reply = (content: any) => {
            if (!data.id) return;
            const response: RawIpcMessage = {
                id: data.id,
                content,
                internal: true,
                type: RawIpcMessageType.RESPONSE
            };
            this.cluster.worker!.send(response);
        };
        const message: Message = {
            repliable: !!data.id,
            content: data.content,
            reply
        };
        if (!message.content.internal)
            return this.manager.emit(LibraryEvents.MESSAGE, message);
        // internal error handling
        try {
            const content = message.content as InternalEvents;
            switch(content.op) {
            case ClientEvents.READY: {
                const cluster = this.manager.clusters!.get(content.data.clusterId);
                if (cluster) {
                    cluster.ready = true;
                    cluster.readyAt = Date.now();
                    if (cluster.tickReady) cluster.tickReady();
                }
                break;
            }
            case ClientEvents.PING: {
                const end = process.hrtime.bigint().toString();
                message.reply(end);
                break;
            }
            case ClientEvents.EVAL: {
                // don't touch eval data, just forward it to clusters since this is already an instance of InternalEvent
                const data = await this.manager.ipc!.broadcast({
                    content,
                    repliable: true
                });
                message.reply(data);
                break;
            }
            case ClientEvents.SESSION_INFO: {
                if (content.data.update || !this.manager.cachedSession)
                    this.manager.cachedSession = await this.manager.fetchSessions();
                message.reply(this.manager.cachedSession);
                break;
            }
            case ClientEvents.RESTART:
                await this.manager.restart(content.data.clusterId);
                break;
            case ClientEvents.RESTART_ALL:
                await this.manager.restartAll();
                break;
            default:
                // shardReconect, shardResume etc
                this.manager.emit(content.op, content.data);
            }
        } catch (error: any) {
            if (!message.repliable) throw error as Error;
            message.reply({
                internal: true,
                error: true,
                name: error.name,
                reason: error.reason,
                stack: error.stack
            } as InternalError);
        }
    }
}
