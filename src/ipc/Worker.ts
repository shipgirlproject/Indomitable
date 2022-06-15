import { Client } from 'net-ipc';
import { Indomitable } from '../Indomitable';
import { InternalEvents, ClientEvents, LibraryEvents, Message, Transportable, InternalError } from '../Util';
import { ShardClientUtil } from '../client/ShardClientUtil';

export class Worker {
    public readonly shard: ShardClientUtil;
    public readonly manager: Indomitable;
    public readonly connection: Client;
    constructor(shard: ShardClientUtil, manager: Indomitable) {
        this.shard = shard;
        this.manager = manager;
        this.connection = new Client({ ...{ path: 'indomitable', compress: false, messagepack: true, reconnect: true }, ...(this.manager.ipcOptions.worker || {}) })
            .on('ready', (...args) => this.shard.emit(LibraryEvents.READY, ...args))
            .on('close', (...args) => this.shard.emit(LibraryEvents.CLOSE, ...args))
            .on('status', (...args) => this.shard.emit(LibraryEvents.STATUS, ...args))
            .on('message', message => this.message(message))
            .on('request', (message, response) => this.message(message, response));
        if (this.shard.listeners(LibraryEvents.ERROR).length >= 1)
            this.connection.on('error', (...args) => this.shard.emit(LibraryEvents.ERROR, ...args));
        else
            this.connection.on('error', () => null);
    }

    public async send(transportable: Transportable): Promise<any|void> {
        const repliable = transportable.repliable ?? false;
        if (repliable) {
            const result: any = await this.connection.request(transportable, this.manager.ipcTimeout);
            if (result?.internal && result.error) {
                const error = new Error(result.value.reason || 'Unspecified reason');
                error.stack = result.value.stack;
                error.name = result.value.name;
                throw error;
            }
            return result;
        } else
            return this.connection.send(transportable);
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
                    if (content.op === ClientEvents.EVAL)
                        await message.reply(this.shard.client._eval(message.content.data));
                } catch (error: any) {
                    if (!message.repliable) throw error;
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
        } catch (error) {
            // most people handle client.on('error', () => {}) in discord.js since its mandatory, so we'll take advantage of it
            this.shard.client.emit(LibraryEvents.ERROR, error);
        }
    }
}
