import Https, { RequestOptions } from 'https';

export enum ClientEvents {
    EVAL = 'eval',
    RESTART = 'restart',
    RESTART_ALL = 'restartAll',
    READY = 'ready',
    SHARD_READY = 'shardReady',
    SHARD_RECONNECT = 'shardReconnect',
    SHARD_RESUME = 'shardResume',
    SHARD_DISCONNECT = 'shardDisconnect'
}

export enum LibraryEvents {
    DEBUG = 'debug',
    CONNECT = 'connect',
    DISCONNECT = 'disconnect',
    CLOSE = 'close',
    MESSAGE = 'message',
    STATUS = 'status',
    ERROR = 'error',
    WORKER_FORK= 'workerFork',
    WORKER_EXIT = 'workerExit',
    SHARD_READY = 'shardReady',
    SHARD_RECONNECT = 'shardReconnect',
    SHARD_RESUME = 'shardResume',
    SHARD_DISCONNECT = 'shardDisconnect'
}

export interface PromiseOutcome {
	status: 'fulfilled' | 'rejected';
	value?: any;
	reason?: any;
}

export interface InternalEvents {
    op: ClientEvents,
    data: any,
    internal: true
}

export interface InternalError {
    internal: true;
    error: true;
    name: string;
    reason: string;
    stack: string;
}

export interface Transportable {
    content: any;
    repliable?: boolean;
}

export interface Message {
    reply: (data: any) => Promise<void>;
    content: any;
    repliable: boolean;
}

export interface SessionObject {
	url: string;
	shards: number;
	session_start_limit: {
		total: number;
		remaining: number;
		reset_after: number;
        max_concurrency: number;
	};
}

export function Fetch(url: string|URL, options: RequestOptions): Promise<any> {
    return new Promise((resolve, reject) => {
        const request = Https.request(url, options, response => {
            const chunks: any[] = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('error', reject);
            response.on('end', () => {
                const code = response.statusCode ?? 500;
                const body = chunks.join('');
                if (code >= 200 && code <= 299)
                    resolve(body);
                else
                    reject(new Error(`Response received is not ok, Status Code: ${response.statusCode}, body: ${body}`));
            });
        });
        request.on('error', reject);
        request.end();
    });
}

export async function FetchSessions(token: string): Promise<SessionObject> {
    const url = new URL('https://discord.com/api/v10/gateway/bot');
    const data = await Fetch(url, {
        method: 'GET',
        headers: { authorization: `Bot ${token}` }
    });
    return JSON.parse(data);
}

export function Chunk(original: any[], chunks: number): any[] {
    const array = [];
    for (let i = 0; i < original.length; i += chunks)
        array.push(original.slice(i , i + chunks));
    return array;
}

export function Delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(() => resolve(), ms).unref());
}
