import Https, { RequestOptions } from 'node:https';

/**
 * Events for internal use
 */
export enum ClientEvents {
    EVAL = 'eval',
    RESTART = 'restart',
    RESTART_ALL = 'restartAll',
    DESTROY_CLIENT = 'destroyClient',
    REQUEST_IDENTIFY = 'requestIdentify',
    CANCEL_IDENTIFY = 'cancelIdentify',
    SESSION_INFO = 'sessionInfo',
    READY = 'ready',
    PING = 'ping',
    SHARD_READY = 'shardReady',
    SHARD_RECONNECT = 'shardReconnect',
    SHARD_RESUME = 'shardResume',
    SHARD_DISCONNECT = 'shardDisconnect'
}

/**
 * Events emitted by Indomitable
 */
export enum LibraryEvents {
    DEBUG = 'debug',
    MESSAGE = 'message',
    ERROR = 'error',
    WORKER_FORK = 'workerFork',
    WORKER_READY = 'workerReady',
    WORKER_EXIT = 'workerExit',
    SHARD_READY = 'shardReady',
    SHARD_RECONNECT = 'shardReconnect',
    SHARD_RESUME = 'shardResume',
    SHARD_DISCONNECT = 'shardDisconnect',
    CLIENT_READY = 'clientReady',
    RAW = 'raw'
}

/**
 * Type for raw ipc message
 */
export enum RawIpcMessageType {
    MESSAGE = 'message',
    RESPONSE = 'response'
}

/**
 * Data structure representing an internal event
 */
export interface InternalEvents {
    op: ClientEvents,
    data: any,
    internal: true
}

/**
 * Data structure representing an internal error
 */
export interface InternalError {
    internal: true;
    error: true;
    name: string;
    reason: string;
    stack: string;
}

/**
 * Data structure representing IPC data
 */
export interface Transportable {
    content: any;
    repliable?: boolean;
    signal?: AbortSignal
}

/**
 * Data structure representing an internal abort data
 */
export interface InternalAbortSignal {
    listener: () => void,
    signal: AbortSignal
}

export interface SavePromiseOptions {
    id: string;
    resolve: (data: unknown) => void;
    reject: (reason: unknown) => void;
    signal?: AbortSignal | undefined;
}

/**
 * Data structure representing a generated abort controller instance
 */
export interface AbortableData {
    controller: AbortController;
    timeout: NodeJS.Timeout;
}

/**
 * Internal promise data tracking
 */
export interface InternalPromise {
    resolve: Function;
    reject: Function;
    controller?: InternalAbortSignal;
}

/**
 * Data structure representing internal IPC data
 */
export interface RawIpcMessage {
    id: string|null;
    content: any;
    internal: true;
    type: RawIpcMessageType
}

/**
 * Data structure representing an IPC message
 */
export interface Message {
    reply: (data: any) => void;
    content: any;
    repliable: boolean;
}

/**
 * Data structure representing a Discord session
 */
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

/**
 * Wrapper function for fetching data using HTTP
 * @param url URL of resource to fetch
 * @param options RequestOptions to modify behavior
 * @returns A promise containing data fetched, or an error
 */
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

/**
 * Fetch sessions from discord
 * @param token Bot token
 * @returns A promise containing a session object
 */
export async function FetchSessions(token: string): Promise<SessionObject> {
    const url = new URL('https://discord.com/api/v10/gateway/bot');
    const data = await Fetch(url, {
        method: 'GET',
        headers: { authorization: `Bot ${token}` }
    });
    return JSON.parse(data);
}

/**
 * Modify an array to contain the specified amount of chunks
 * @param original An array of data
 * @param chunks The amount of chunks to transform into
 * @returns A modified array
 */
export function Chunk(original: any[], chunks: number): any[] {
    const array = [];
    for (let i = 0; i < original.length; i += chunks)
        array.push(original.slice(i , i + chunks));
    return array;
}

/**
 * Wait for a specific amount of time (timeout)
 * @param ms Time to wait in milliseconds
 * @returns A promise that resolves in x seconds
 */
export function Delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}

/**
 * Creates an abortable request with controller and timeout
 * @param delay Time before an abort error throws
 * @returns An abortable data with controller and timeout
 */
export function MakeAbortableRequest(delay: number): AbortableData {
    const controller = new AbortController();
    const seconds = Math.round(delay / 1000);
    const timeout = setTimeout(
        () => controller.abort(new Error(`The request has been aborted in ${seconds} second(s)`)),
        delay
    );
    return { controller, timeout };
}
