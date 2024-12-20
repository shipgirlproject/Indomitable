import { Fetch } from '../Util';
import { BaseWorker } from '../ipc/BaseWorker';

/**
 * Internal class that is passed to @discordjs/ws to handle concurrency
 */
export class ConcurrencyClient {
    private ipc: BaseWorker;
    private readonly address: string;
    private readonly port: number;
    private readonly password: string;

    constructor(ipc: BaseWorker) {
        this.ipc = ipc;
        this.address = process.env.INDOMITABLE_CONCURRENCY_SERVER_ADDRESS!;
        this.port = Number(process.env.INDOMITABLE_CONCURRENCY_SERVER_PORT!);
        this.password = process.env.INDOMITABLE_CONCURRENCY_SERVER_PASSWORD!;
    }

    /**
     * Method to try and acquire a lock for identify
     */
    public async waitForIdentify(shardId: number, signal: AbortSignal): Promise<void> {
        const url = new URL(`http://${this.address}:${this.port}/concurrency/acquire`);
        url.searchParams.append('shardId', shardId.toString());

        const response = await Fetch(url.toString(), { method: 'POST' });

        // 202 = acquire lock cancelled, 204 = success, allow identify, 4xx = something bad happened
        if (response.code !== 204) {
            throw new Error('Acquire lock failed');
        }
    }

    /**
     * Aborts an acquire lock request
     */
    private abortIdentify(shardId: number): void {
        const url = new URL(`http://${this.address}:${this.port}/concurrency/cancel`);
        url.searchParams.append('shardId', shardId.toString());

        Fetch(url.toString(), { method: 'DELETE' })
            .catch(() => null);
    }
}