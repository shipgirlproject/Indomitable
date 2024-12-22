import { AddressInfo } from 'node:net';
import { ConcurrencyManager } from './ConcurrencyManager';
import { Indomitable } from '../Indomitable';
import { LibraryEvents } from '../Util';
import Http from 'node:http';

/**
 * Server that handles identify locks
 */
export class ConcurrencyServer {
    private readonly manager: Indomitable;
    /**
     * Http server of this instance
     * @private
     */
    private readonly server: Http.Server;
    /**
     * Concurrency manager for this server
     * @private
     */
    private readonly concurrency: ConcurrencyManager;
    /**
     * Randomly generated password to secure this server
     * @private
     */
    private readonly password: string;

    constructor(manager: Indomitable, concurrency: number) {
        this.manager = manager;
        this.server = Http.createServer((req, res) => this.handle(req, res));
        this.concurrency = new ConcurrencyManager(concurrency);
        this.password = Math.random().toString(36).slice(2, 10);
    }

    /**
     * Gets the randomly generated password for this instance
     */
    public get key(): string {
        return this.password;
    }

    /**
     * Gets the address info assigned for this instance
     */
    public get info(): AddressInfo {
        return this.server.address() as AddressInfo;
    }

    /**
     * Handles the incoming requests
     * @param request
     * @param response
     * @private
     */
    private async handle(request: Http.IncomingMessage, response: Http.ServerResponse): Promise<void> {
        const now = Date.now();

        if (!request.url || request.method !== 'POST' && request.method !== 'DELETE') {
            response.statusCode = 404;
            response.statusMessage = 'Not Found';
            return void response.end();
        }

        if (request.headers['authorization'] !== this.password) {
            response.statusCode = 401;
            response.statusMessage = 'Unauthorized';
            return void response.end();
        }

        if (!request.url.includes('?shardId=')) {
            response.statusCode = 400;
            response.statusMessage = 'Bad Request';
            return void response.end('Missing shardId query string');
        }

        const shardId = Number(request.url.split('?shardId=')[1]);

        if (isNaN(shardId)) {
            response.statusCode = 400;
            response.statusMessage = 'Bad Request';
            return void response.end('Expected shardId to be a number');
        }

        this.manager.emit(LibraryEvents.DEBUG, `Received a request in concurrency server! =>\n  Url: ${request.url}\n  Method: ${request.method}\n  ShardId: ${shardId}`);

        if (request.method === 'DELETE' && request.url.includes('/concurrency/cancel')) {
            this.concurrency.abortIdentify(shardId);
            response.statusCode = 204;
            response.statusMessage = 'No Content';
            return void response.end();
        }

        if (request.method === 'POST' && request.url.includes('/concurrency/acquire')) {
            try {
                await this.concurrency.waitForIdentify(shardId);
                response.statusCode = 204;
                response.statusMessage = 'No Content';
                return void response.end();
            } catch (error) {
                response.statusCode = 202;
                response.statusMessage = 'Accepted';
                return void response.end('Acquire lock cancelled');
            }
        }

        if (request.method === 'POST' && request.url.includes('/concurrency/check')) {
            response.statusCode = 200;
            response.statusMessage = 'OK';
            return void response.end(now.toString());
        }

        response.statusCode = 404;
        response.statusMessage = 'Not Found';
        return void response.end();
    }

    /**
     * Starts this server
     */
    public start(): Promise<AddressInfo> {
        return new Promise((resolve) => {
            this.server.listen(0 , '127.0.0.1', () => resolve(this.info));
        })
    }
}