import { ChildProcess, Serializable } from 'node:child_process';
import { randomUUID } from 'crypto';
import { Indomitable } from '../Indomitable';
import { InternalEvents, ClientEvents, LibraryEvents, Message, Transportable, InternalError, RawIpcMessage, RawIpcMessageType, InternalPromise } from '../Util';
import { ShardClientUtil } from '../client/ShardClientUtil';

export class Worker {
    public readonly shard: ShardClientUtil;
    public readonly manager: Indomitable;
    private readonly promises: Map<string, InternalPromise>;
    constructor(shard: ShardClientUtil, manager: Indomitable) {
        this.shard = shard;
        this.manager = manager;
        this.promises = new Map();
        (process as unknown as ChildProcess).on('message', data => this.handle(data));
    }

    public get pending(): number {
        return this.promises.size;
    }

    public async ping(): Promise<number> {
        const content: InternalEvents = {
            op: ClientEvents.PING,
            data: {},
            internal: true
        };
        const start = process.hrtime.bigint();
        const end = await this.send({ content, repliable: true });
        return Number(end - start);
    }

    public send(transportable: Transportable): Promise<any|undefined> {
        return new Promise((resolve, reject) => {
            const repliable = transportable.repliable || false;
            const id = repliable ? randomUUID() : null;
            const data: RawIpcMessage = {
                id,
                content: transportable.content,
                internal: true,
                type: RawIpcMessageType.MESSAGE
            };
            try {
                (process as unknown as ChildProcess).send(data);
            } catch (error) {
                return reject(error);
            }
            if (!id) return resolve(undefined);
            const timeout = setTimeout(() => {
                this.promises.delete(id);
                reject(new Error('This request timed out'));
            }, this.manager.ipcTimeout).unref();
            this.promises.set(id, { resolve, reject, timeout } as InternalPromise);
        });
    }

    private handle(data: Serializable): boolean|void {
        try {
            if (!(data as any).internal)
                return this.manager.emit(LibraryEvents.MESSAGE, data);
            if ((data as RawIpcMessage).type === RawIpcMessageType.MESSAGE)
                return this.message(data as RawIpcMessage);
            if ((data as RawIpcMessage).type === RawIpcMessageType.RESPONSE)
                return this.promise(data as RawIpcMessage);
        } catch (error: unknown) {
            // most people handle client.on('error', () => {}) in discord.js since its mandatory, so we'll take advantage of it
            this.shard.client.emit(LibraryEvents.ERROR, error as Error);
        }
    }

    private promise(data: RawIpcMessage): void {
        const id = data.id as string;
        const promise = this.promises.get(id);
        if (!promise) return;
        this.promises.delete(id);
        clearTimeout(promise.timeout);
        if (data.content?.internal && data.content?.error) {
            const error = new Error(data.content.reason || 'Unknown error reason');
            error.stack = data.content.stack;
            error.name = data.content.name;
            return promise.reject(error);
        }
        promise.resolve(data.content);
    }

    private message(data: RawIpcMessage): boolean|void {
        const reply = (content: any) => {
            if (!data.id) return;
            const response: RawIpcMessage = {
                id: data.id,
                content,
                internal: true,
                type: RawIpcMessageType.RESPONSE
            };
            (process as unknown as ChildProcess).send(response);
        };
        const message: Message = {
            repliable: !!data.id,
            content: data.content,
            reply
        };
        if (!message.content.internal)
            return this.shard.emit(LibraryEvents.MESSAGE, message);
        try {
            const content = message.content as InternalEvents;
            if (content.op === ClientEvents.EVAL)
            // @ts-ignore -- needs to be accessed for broadcastEval
                message.reply(this.shard.client._eval(content.data));
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
