import { randomUUID } from 'crypto';
import { BaseIpc } from './BaseIpc.js';
import { ClusterManager } from '../ClusterManager';
import { Message, LibraryEvents, Transportable, InternalEvents, ClientEvents, RawIpcMessage, RawIpcMessageType, InternalError } from '../Util';

export class Main extends BaseIpc{
    public readonly cluster: ClusterManager;
    constructor(cluster: ClusterManager) {
        super(cluster.manager);
        this.cluster = cluster;
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
            this.waitForPromise({ id, resolve, reject, signal: transportable.signal });
        });
    }

    protected async handleMessage(data: RawIpcMessage): Promise<boolean|void> {
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
            this.manager.emit(LibraryEvents.DEBUG, `Received internal message. op: ${content.op} | data: `, content.data);
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
            case ClientEvents.REQUEST_IDENTIFY:
                await this.manager.concurrencyManager!.waitForIdentify(content.data.shardId);
                message.reply(null);
                break;
            case ClientEvents.CANCEL_IDENTIFY:
                this.manager.concurrencyManager!.abortIdentify(content.data.shardId);
                break;
            case ClientEvents.RESTART:
                await this.manager.restart(content.data.clusterId);
                break;
            case ClientEvents.RESTART_ALL:
                await this.manager.restartAll();
                break;
            default:
                // shardReconnect, shardResume etc
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
