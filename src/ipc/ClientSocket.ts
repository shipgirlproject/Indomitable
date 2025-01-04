import type { ShardClientUtil } from '../client/ShardClientUtil';
import { Socket } from 'node:net';
import { BaseSocket, Message } from './BaseSocket';
import { ClientEventData, InternalOps, InternalOpsData, IpcIdentify, LibraryEvents } from '../Util';

const internalOpsValues = Object.values(InternalOps);

export class ClientSocket extends BaseSocket {
    public readonly shard: ShardClientUtil;
    private readonly serverId: string;

    constructor(shard: ShardClientUtil, serverId: string) {
        super(new Socket());
        this.shard = shard;
        this.serverId = serverId;
    }

    public connect(): void {
        this.socket.connect({path: `./indomitable-${this.serverId}`}, () => {
            this.identify({clusterId: this.shard.clusterId, serverId: this.serverId})
                .catch(() => null);
        });

    }

    public identify(data: IpcIdentify): Promise<void> {
        const content: InternalOpsData = {
            op: InternalOps.IDENTIFY,
            internal: true,
            data
        };
        return this.send({content, reply: true}) as Promise<void>;
    }

    protected handleClose(): void {
        // tba
    }

    protected handleError(error: Error): void {
        this.shard.client.emit('error', error);
    }

    protected handleMessage(message: Message): Promise<void> {
        if (message.content.internal !== 'boolean' && !message.content.internal) {
            this.shard.emit(LibraryEvents.MESSAGE, message);
            return Promise.resolve();
        }

        const content = message.content as InternalOpsData | ClientEventData;

        if (!internalOpsValues.includes(message.content.op))
            return Promise.resolve();

        switch (content.op) {
            case InternalOps.EVAL:
                // @ts-expect-error
                message.reply(this.shard.client._eval(content.data));
                break;
            case InternalOps.DESTROY_CLIENT:
                this.shard.client!.destroy();
                message.send(null);
        }

        return Promise.resolve();
    }
}