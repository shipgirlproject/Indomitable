import { Delay, Fetch } from '../Util';

/**
 * Internal class that is passed to @discordjs/ws to handle concurrency
 */
export class ConcurrencyClient {
    private readonly address: string;
    private readonly port: number;
    private readonly password: string;

    constructor() {
        this.address = process.env.INDOMITABLE_CONCURRENCY_SERVER_ADDRESS!;
        this.port = Number(process.env.INDOMITABLE_CONCURRENCY_SERVER_PORT!);
        this.password = process.env.INDOMITABLE_CONCURRENCY_SERVER_PASSWORD!;
    }

    /**
     * Method to try and acquire a lock for identify. This could never error or else it would hang out the whole system.
     * Look at (https://github.com/discordjs/discord.js/blob/f1bce54a287eaa431ceb8b1996db87cbc6290317/packages/ws/src/strategies/sharding/WorkerShardingStrategy.ts#L321)
     * If it errors that isn't anything from websocket shard, this will have issues
     */
    public async waitForIdentify(shardId: number, signal: AbortSignal): Promise<void> {
        const url = new URL(`http://${this.address}:${this.port}/concurrency/acquire`);
        url.searchParams.append('shardId', shardId.toString());

        const listener = () => {
            const url = new URL(`http://${this.address}:${this.port}/concurrency/cancel`);

            url.searchParams.append('shardId', shardId.toString());

            Fetch(url.toString(), {
                method: 'DELETE',
                headers: { authorization: this.password }
            }).catch(() => null);
        }

        try {
            signal.addEventListener('abort', listener);

            const response = await Fetch(url.toString(), {
                method: 'POST',
                headers: { authorization: this.password }
            });

            if (response.code === 202 || response.code === 204) {
                // aborted request || ok request
                return;
            }

            if (response.code >= 400 && response.code <= 499) {
                // something happened server didn't accept your req
                await Delay(1000);
                return;
            }
        } catch (_) {
            // this should not happen but we just delay if it happens
            await Delay(1000);
        } finally {
            signal.removeEventListener('abort', listener);
        }
    }

    public async checkServer(): Promise<number> {
        const url = new URL(`http://${this.address}:${this.port}/concurrency/check`);
        url.searchParams.append('shardId', '0');
        const response = await Fetch(url.toString(), {
            method: 'POST',
            headers: { authorization: this.password }
        });
        return response.body;
    }
}