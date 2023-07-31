import { BaseIpc } from './BaseIpc.js';
import { ClusterManager } from '../manager/ClusterManager.js';
import { Indomitable } from '../Indomitable';
import {
    InternalOps,
    InternalOpsData,
    ClientEvents,
    ClientEventData,
    LibraryEvents,
    Message,
    RawIpcMessage
} from '../Util';

const internalOpsValues = Object.values(InternalOps);
const clientEventsValues = Object.values(ClientEvents);

/**
 * Primary ipc class. Only initialized at main process
 */
export class MainWorker extends BaseIpc {
    public readonly cluster: ClusterManager;
    constructor(cluster: ClusterManager) {
        super(cluster.manager);
        this.cluster = cluster;
    }

    protected available(): boolean {
        return !!this.cluster.worker;
    }

    protected sendData(data: RawIpcMessage): void {
        this.cluster.worker?.send(data);
    }

    protected async handleMessage(message: Message): Promise<void> {
        this.manager.emit(LibraryEvents.DEBUG, `Received internal message. op: ${message.content.op} | data: ${JSON.stringify(message.content.data || {})}`);
        const manager = this.manager as Indomitable;
        if (internalOpsValues.includes(message.content.op)) {
            const content = message.content as InternalOpsData;
            switch(content.op) {
                case InternalOps.PING: {
                    const end = process.hrtime.bigint().toString();
                    message.reply(end);
                    break;
                }
                case InternalOps.EVAL: {
                    // don't touch eval data, just forward it to clusters since this is already an instance of InternalEvent
                    const data = await manager.broadcast({
                        content,
                        repliable: true
                    });
                    message.reply(data);
                    break;
                }
                case InternalOps.SESSION_INFO: {
                    if (content.data.update || !manager.cachedSession)
                        manager.cachedSession = await manager.fetchSessions();
                    message.reply(manager.cachedSession);
                    break;
                }
                case InternalOps.REQUEST_IDENTIFY:
                    await manager.concurrencyManager!.waitForIdentify(content.data.shardId);
                    message.reply(null);
                    break;
                case InternalOps.CANCEL_IDENTIFY:
                    manager.concurrencyManager!.abortIdentify(content.data.shardId);
                    break;
                case InternalOps.RESTART:
                    await manager.restart(content.data.clusterId);
                    break;
                case InternalOps.RESTART_ALL:
                    await manager.restartAll();
                    break;
            }
        } else if (clientEventsValues.includes(message.content.op)) {
            const content = message.content as ClientEventData;
            switch(content.op) {
                case ClientEvents.READY:
                    this.manager.emit(LibraryEvents.CLIENT_READY, content.data);
                    break;
                case ClientEvents.SHARD_READY:
                    this.manager.emit(LibraryEvents.SHARD_READY, content.data);
                    break;
                case ClientEvents.SHARD_RECONNECT:
                    this.manager.emit(LibraryEvents.SHARD_RECONNECT, content.data);
                    break;
                case ClientEvents.SHARD_RESUME:
                    this.manager.emit(LibraryEvents.SHARD_RESUME, content.data);
                    break;
                case ClientEvents.SHARD_DISCONNECT:
                    this.manager.emit(LibraryEvents.SHARD_DISCONNECT, content.data);
            }
        }
    }
}
