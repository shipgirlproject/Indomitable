import { Indomitable } from '../Indomitable';
import { ShardClientUtil } from '../client/ShardClientUtil';
import { BaseWorker } from './BaseWorker';
import {
    ClientEvents,
    InternalError,
    InternalEvents,
    LibraryEvents,
    Message,
    RawIpcMessage,
    RawIpcMessageType
} from '../Util';

/**
 * Extended worker ipc class, shard client util ipc class
 */
export class ClientWorker extends BaseWorker {
    public readonly shard: ShardClientUtil;
    constructor(shard: ShardClientUtil, manager: Indomitable) {
        super(manager);
        this.shard = shard;
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
            this.sendData(response);
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
