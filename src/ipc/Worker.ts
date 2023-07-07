import { ChildProcess, Serializable } from 'node:child_process';
import { randomUUID } from 'crypto';
import { BaseIpc } from './BaseIpc.js';
import { Indomitable } from '../Indomitable';
import { ShardClientUtil } from '../client/ShardClientUtil';
import {
    ClientEvents,
    InternalError,
    InternalEvents,
    LibraryEvents,
    Message,
    RawIpcMessage,
    RawIpcMessageType,
    Transportable
} from '../Util';

/**
 * Worker ipc class. Only initialized at worker process
 */
export class Worker extends BaseIpc {
    public readonly shard: ShardClientUtil;
    private built: boolean;
    constructor(shard: ShardClientUtil, manager: Indomitable) {
        super(manager);
        this.shard = shard;
        this.built = false;
    }

    /**
     * Builds the pre-initialized worker ipc
     * @internal
     */
    public build(): void {
        if (this.built) return;
        this.built = true;
        process.on('message',
            data => this.handleRawResponse(data as Serializable, error => this.shard.client!.emit(LibraryEvents.ERROR, error as Error))
        );
    }

    /**
     * Raw send method without abort controller handling
     * @param transportable Data to send
     */
    public send(transportable: Transportable): Promise<unknown|undefined> {
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
            this.waitForPromise({ id, resolve, reject, signal: transportable.signal });
        });
    }

    protected handleMessage(data: RawIpcMessage): boolean|void {
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
            switch (content.op) {
            case ClientEvents.EVAL:
                // @ts-expect-error
                message.reply(this.shard.client._eval(content.data));
                break;
            case ClientEvents.DESTROY_CLIENT:
                this.shard.client!.destroy();
                message.reply(null);
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
