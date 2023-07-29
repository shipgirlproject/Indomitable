import { Indomitable } from '../Indomitable';
import { ShardClientUtil } from '../client/ShardClientUtil';
import { BaseWorker } from './BaseWorker';
import {
    InternalOps,
    InternalOpsData,
    LibraryEvents,
    Message,
    RawIpcMessage,
    RawIpcMessageType
} from '../Util';

const internalOpsValues = Object.values(InternalOps);

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
            if (!internalOpsValues.includes(message.content.op)) return;
            const content = message.content as InternalOpsData;
            switch (content.op) {
                case InternalOps.EVAL:
                    // @ts-expect-error
                    message.reply(this.shard.client._eval(content.data));
                    break;
                case InternalOps.DESTROY_CLIENT:
                    this.shard.client!.destroy();
                    message.reply(null);
            }
        } catch (error: any) {
            if (!message.repliable) throw error as Error;
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
}
