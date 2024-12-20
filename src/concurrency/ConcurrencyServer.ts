import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ConcurrencyManager } from './ConcurrencyManager';
import { AddressInfo } from 'node:net';

/**
 * Server that handles identify locks
 */
export class ConcurrencyServer {
    /**
     * Fastify instance of this server
     * @private
     */
    private readonly fastify: FastifyInstance;
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
        this.fastify = Fastify();
        this.manager = new ConcurrencyManager(concurrency);
        this.password = Math.random().toString(36).slice(2, 10);

        this.fastify.route({
            method: 'POST',
            url: '/concurrency/acquire',
            handler: (req, res) => this.handle(req, res)
        });

        this.fastify.route({
            method: 'DELETE',
            url: '/concurrency/cancel',
            handler: (req, res) => this.handle(req, res)
        })
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
        return this.fastify.addresses().filter(a => a.family === 'IPv4').shift()!;
    }

    /**
     * Handles the incoming requests
     * @param request
     * @param reply
     * @private
     */
    private async handle(request: FastifyRequest, reply: FastifyReply): Promise<string> {
        if (request.headers['authorization'] !== this.password) {
            reply.code(401);
            return 'Unauthorized';
        }

        // @ts-expect-error: this is ok
        if (!request.query.hasOwnProperty('shardId')) {
            reply.code(400);
            return 'Missing shardId query string';
        }

        // @ts-expect-error: this is ok
        const shardId = Number(request.query['shardId']);

        if (isNaN(shardId)) {
            reply.code(400);
            return 'Expected shardId to be a number';
        }

        if (request.url.includes('/concurrency/cancel')) {

            this.manager.abortIdentify(shardId);

        } else {
            try {
                await this.manager.waitForIdentify(shardId);
            } catch (error) {
                reply.code(202);
                return 'Acquire lock cancelled';
            }
        }

        reply.code(204);

        return '';
    }

    /**
     * Starts this server
     */
    public async start(): Promise<AddressInfo> {
        await this.fastify.listen();
        return this.fastify.addresses().filter(a => a.family === 'IPv4').shift()!;
    }
}