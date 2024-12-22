import { AddressInfo } from 'node:net';
import { ConcurrencyManager } from './ConcurrencyManager';
import Http from 'node:http';

/**
 * Server that handles identify locks
 */
export class ConcurrencyServer {
    /**
     * Fastify instance of this server
     * @private
     */
    private readonly server: Http.Server;
    /**
     * Concurrency manager for this server
     * @private
     */
    private readonly manager: ConcurrencyManager;
    /**
     * Randomly generated password to secure this server
     * @private
     */
    private readonly password: string;
    constructor(concurrency: number) {
        this.server = Http.createServer((req, res) => this.handle(req, res));
        this.manager = new ConcurrencyManager(concurrency);
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
        return this.server.address as unknown as AddressInfo;
    }

    /**
     * Handles the incoming requests
     * @param request
     * @param response
     * @private
     */
    private async handle(request: Http.IncomingMessage, response: Http.ServerResponse): Promise<void> {
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

        // @ts-expect-error: this is ok
        if (!request.query.hasOwnProperty('shardId')) {
            response.statusCode = 400;
            response.statusMessage = 'Bad Request';
            return void response.end('Missing shardId query string');
        }

        // @ts-expect-error: this is ok
        const shardId = Number(request.query['shardId']);

        if (isNaN(shardId)) {
            response.statusCode = 400;
            response.statusMessage = 'Bad Request';
            return void response.end('Expected shardId to be a number');
        }

        if (request.method === 'DELETE' && request.url.includes('/concurrency/cancel')) {
            this.manager.abortIdentify(shardId);
            response.statusCode = 200;
            response.statusMessage = 'OK';
            return void response.end();
        }

        if (request.method === 'POST' && request.url.includes('/concurrency/acquire')) {
            try {
                await this.manager.waitForIdentify(shardId);
                response.statusCode = 204;
                response.statusMessage = 'No Content';
                return void response.end();
            } catch (error) {
                response.statusCode = 202;
                response.statusMessage = 'Accepted';
                return void response.end('Acquire lock cancelled');
            }
        }

        response.statusCode = 404;
        response.statusMessage = 'Not Found';
        return void response.end();
    }

    /**
     * Starts this server
     */
    public start(): Promise<AddressInfo> {
        return new Promise((resolve, reject) => {
            this.server.listen((error: Error, addressInfo: AddressInfo) => {
                if (error) return reject(error);
                resolve(addressInfo);
            })
        })
    }
}