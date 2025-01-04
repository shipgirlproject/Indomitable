import type { Socket } from 'node:net';
import type { Indomitable } from '../Indomitable';
import { IpcServer } from './IpcServer';
import { BaseSocket, Message } from './BaseSocket';
import { ClientEventData, ClientEvents, InternalOps, InternalOpsData, LibraryEvents, } from '../Util';

const internalOpsValues = Object.values(InternalOps);
const clientEventsValues = Object.values(ClientEvents);

export class ServerSocket extends BaseSocket {
    private readonly manager: Indomitable;
    private readonly server: IpcServer;

    constructor(manager: Indomitable, server: IpcServer, socket: Socket) {
        super(socket);
        this.manager = manager;
        this.server = server;
    }

    protected handleClose(): void {
        this.manager.emit(LibraryEvents.DEBUG, `A socket closed with ${this.socket.bytesRead} byte(s) data written`);
    }

    protected handleError(error: Error): void {
        this.manager.emit(LibraryEvents.ERROR, error);
    }

    protected async handleMessage(message: Message): Promise<void> {
        try {
            if (typeof message.content.internal !== 'boolean' && !message.content.internal)
                return void this.manager.emit(LibraryEvents.MESSAGE, message);

            const content = message.content as InternalOpsData | ClientEventData;

            if (internalOpsValues.includes(message.content.op)) {

                switch (content.op) {
                    case InternalOps.IDENTIFY: {
                        if (content.data.serverId !== this.server.serverId) {
                            this.socket.destroy();
                            message.error(new Error('Incorrect server id passed'));
                            break;
                        }
                        message.send(null);
                        break;
                    }
                    case InternalOps.PING: {
                        const end = process.hrtime.bigint().toString();
                        message.send(end);
                        break;
                    }
                    case InternalOps.EVAL: {
                        // don't touch eval data, just forward it to clusters since this is already an instance of InternalEvent
                        const data = await this.manager.broadcast({
                            content,
                            reply: true
                        });
                        message.send(data);
                        break;
                    }
                    case InternalOps.SESSION_INFO: {
                        if (content.data.update || !this.manager.cachedSession)
                            this.manager.cachedSession = await this.manager.fetchSessions();
                        message.send(this.manager.cachedSession);
                        break;
                    }
                    case InternalOps.RESTART:
                        await this.manager.restart(content.data.clusterId);
                        break;
                    case InternalOps.RESTART_ALL:
                        await this.manager.restartAll();
                        break;
                }

            } else if (clientEventsValues.includes(message.content.op)) {

                switch (content.op) {
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
        } catch (error: any) {
            message.error(error);
        }
    }
}