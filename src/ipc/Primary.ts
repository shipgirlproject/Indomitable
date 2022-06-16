import { Server } from 'net-ipc';
import { Indomitable } from '../Indomitable';
import { Message, LibraryEvents, Transportable, InternalEvents, ClientEvents, PromiseOutcome, InternalError } from '../Util';

export class Primary {
    public readonly manager: Indomitable;
    public readonly server: Server;
    constructor(manager: Indomitable) {
        this.manager = manager;
        this.server = new Server({ ...{ path: 'indomitable' }, ...(this.manager.ipcOptions.primary || {}) })
            .on('ready', (address: string) => this.manager.emit(LibraryEvents.DEBUG, `Indomitable's IPC server is now ready, currently bound at address: ${address}`))
            .on('connect', (...args) => this.manager.emit(LibraryEvents.CONNECT, ...args))
            .on('disconnect', (...args) => this.manager.emit(LibraryEvents.DISCONNECT, ...args))
            .on('close', (...args) => this.manager.emit(LibraryEvents.CLOSE, ...args))
            .on('message', message => this.message(message))
            .on('request', (message, response) => this.message(message, response));
        if (this.manager.listeners(LibraryEvents.ERROR).length >= 1)
            this.server.on('error', (...args) => this.manager.emit(LibraryEvents.ERROR, ...args));
        else
            this.server.on('error', () => null);
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
        } else
            return this.server.broadcast(transportable);
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
