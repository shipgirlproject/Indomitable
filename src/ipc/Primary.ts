import { Connection, Server } from 'net-ipc';
import { Indomitable } from '../Indomitable';
import { Message, LibraryEvents, Transportable, InternalEvents, ClientEvents, PromiseOutcome, InternalError } from '../Util';

export class Primary {
    public readonly manager: Indomitable;
    public readonly server: Server;
    constructor(manager: Indomitable) {
        this.manager = manager;
        this.server = new Server({ ...{ path: 'indomitable' }, ...(this.manager.ipcOptions.primary || {}) })
            .on('ready', (address: string) => this.manager.emit(LibraryEvents.DEBUG, `Indomitable's IPC server is now ready, currently bound at address: ${address}`))
            .on('disconnect', (...args) => this.manager.emit(LibraryEvents.DISCONNECT, ...args))
            .on('close', (...args) => this.manager.emit(LibraryEvents.CLOSE, ...args))
            .on('connect', (connection, payload) => this.connect(connection, payload))
            .on('message', message => this.message(message))
            .on('request', (message, response) => this.message(message, response))
            .on('error', (...args) => {
                if (this.manager.listeners(LibraryEvents.ERROR).length === 0) return;
                this.manager.emit(LibraryEvents.ERROR, ...args);
            });
    }

    public async send(id: number, transportable: Transportable): Promise<any|void> {
        const cluster = this.manager.clusters!.get(id);
        if (!cluster || !cluster.ipcId) throw new Error('This cluster is not yet ready, or have not yet received it\'s id');
        const connection = this.manager.ipc!.server.connections.find(connection => cluster.ipcId === connection.id);
        if (!connection) throw new Error('This cluster connection may have changed it\'s id and is not yet updated on our side');
        const repliable = transportable.repliable ?? false;
        if (repliable) {
            const result: any = await connection.request(transportable, this.manager.ipcTimeout);
            if (result?.internal && result.error) {
                const error = new Error(result.value.reason || 'Unspecified reason');
                error.stack = result.value.stack;
                error.name = result.value.name;
                throw error;
            }
            return result;
        }
        return await connection.send(transportable);
    }

    public async broadcast(transportable: Transportable): Promise<any|void> {
        const repliable = transportable.repliable ?? false;
        if (repliable) {
            const results = await this.server.survey(transportable, this.manager.ipcTimeout) as unknown as PromiseOutcome[];
            const rejected = results.find(result => result.status === 'rejected');
            if (rejected)
                throw new Error(rejected.reason || 'Unspecified reason');
            const values = results.map(result => result.value);
            const internalError: InternalError = values.find(result => result.internal && result.error);
            if (internalError) {
                const error = new Error(internalError.reason || 'Unspecified reason');
                error.stack = internalError.stack;
                error.name = internalError.name;
                throw error;
            }
            return values;
        } else {
            return await Promise.all(
                this.server.connections.map(connection =>
                    connection
                        .send(transportable)
                        .catch((error: unknown) => this.server.emit(LibraryEvents.ERROR, error))
                )
            );
        }
    }

    private connect(connection: Connection, payload: any): void {
        this.manager.emit(LibraryEvents.CONNECT, connection, payload);
        if (!isNaN(payload.clusterId)) return;
        const cluster = this.manager.clusters!.get(payload.clusterId as number);
        cluster!.ipcId = connection.id;
    }

    private async message(data: Transportable, response?: (data: any) => Promise<void>): Promise<void> {
        try {
            const reply = response || (async () => undefined);
            const message: Message = {
                reply,
                content: data.content,
                repliable: !!response,
            };
            // internal events should not be emitted to end user
            if (message.content.internal) {
                // internal error handling
                try {
                    const content = message.content as InternalEvents;
                    switch(content.op) {
                    case ClientEvents.READY:
                        const cluster = this.manager.clusters!.get(content.data.clusterId);
                        if (cluster?.tickReady) cluster.tickReady();
                        break;
                    case ClientEvents.EVAL:
                        // don't touch eval data, just forward it to clusters since this is already an instance of InternalEvent
                        const data = await this.broadcast({
                            content,
                            repliable: true
                        });
                        await message.reply(data);
                        break;
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
                    if (!message.repliable) throw error as any;
                    const internalError: InternalError = {
                        internal: true,
                        error: true,
                        name: error.name,
                        reason: error.reason,
                        stack: error.stack
                    };
                    await message.reply(internalError);
                }
                return;
            }
            this.manager.emit(LibraryEvents.MESSAGE, message);
        } catch (error: unknown) {
            this.manager.emit(LibraryEvents.ERROR, error as Error);
        }
    }
}
