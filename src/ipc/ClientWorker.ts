import { Indomitable } from '../Indomitable';
import { ShardClientUtil } from '../client/ShardClientUtil';
import { BaseWorker } from './BaseWorker';
import {
    InternalOps,
    InternalOpsData,
    LibraryEvents,
    Message
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

    protected emitMessage(message: Message): void {
        this.shard.emit(LibraryEvents.MESSAGE, message);
    }

    protected handleMessage(message: Message): Promise<void> {
        if (!internalOpsValues.includes(message.content.op))
            return Promise.resolve();
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
        return Promise.resolve();
    }
}
