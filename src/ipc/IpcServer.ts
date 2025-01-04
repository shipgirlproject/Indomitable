import type { Indomitable } from '../Indomitable';
import type { ServerSocket } from './ServerSocket';

import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:net';
import { LibraryEvents } from '../Util';


export class IpcServer {
    public readonly serverId: string;
    private readonly manager: Indomitable;
    private readonly server: Server;
    private readonly sockets: Map<string, ServerSocket>;

    constructor(manager: Indomitable) {
        this.manager = manager;
        this.server = createServer();
        this.sockets = new Map();
        this.serverId = randomUUID();
    }

    public getServer(id: string): ServerSocket | undefined {
        return this.sockets.get(id);
    }

    public listen(): Promise<void> {
        return new Promise((resolve, reject) => {
            const listener = (error: Error) => reject(error);

            this.server.once('error', listener);

            this.server.listen(`./indomitable-${this.serverId}`, () => {
                // @ts-expect-error: why this errors?
                this.server.removeListener('error', listener);

                this.server
                    .on('connection', (socket) => {

                    })
                    .on('error', (code) => this.manager.emit(LibraryEvents.ERROR, new Error(`IPC server errored with code: ${code}`)));

                resolve();
            });
        });
    }

    private createSocket(): void {

    }
}