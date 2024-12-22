import Https, { RequestOptions } from 'node:https';
import Http from 'node:http';
import { WebSocketShardEvents } from '@discordjs/ws';

/**
 * Hoisted Environmental Variable for ease of fetching
 */
export const EnvProcessData = {
    clusterId: Number(process.env.INDOMITABLE_CLUSTER || 0),
    clusterCount: Number(process.env.INDOMITABLE_CLUSTER_TOTAL || 0),
    shardIds: (process.env.INDOMITABLE_SHARDS || '').split(' ').map(Number),
    shardCount: Number(process.env.INDOMITABLE_SHARDS_TOTAL || 0)
};

/**
 * Internal operation codes for the cluster -> thread
 */
export enum MainStrategyOps {
    CONNECT = 'connect',
    DESTROY = 'destroy',
    SEND = 'send',
    STATUS = 'status',
    RECONNECT = 'reconnect'
}

/**
 * Internal operation codes for the thread <- cluster
 */
export enum ThreadStrategyOps {
    REQUEST_IDENTIFY = 'requestIdentify',
    CANCEL_IDENTIFY = 'cancelIdentify',
    SHARD_EVENT = 'shardEvent',
    RETRIEVE_SESSION = 'retrieveSession',
    UPDATE_SESSION = 'updateSession'
}

/**
 * Internal operation codes
 */
export enum InternalOps {
    EVAL = 'eval',
    RESTART = 'restart',
    RESTART_ALL = 'restartAll',
    DESTROY_CLIENT = 'destroyClient',
    SESSION_INFO = 'sessionInfo',
    PING = 'ping'
}

/**
 * Events for internal use
 */
export enum ClientEvents {
    READY = 'ready',
    SHARD_READY = 'shardReady',
    SHARD_RECONNECT = 'shardReconnect',
    SHARD_RESUME = 'shardResume',
    SHARD_DISCONNECT = 'shardDisconnect',
    ERROR = 'ERROR'
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
    RESPONSE = 'response',
    ERROR = 'error'
}

/**
 * Type for raw ipc messages of cluster -> thread
 */
export interface MainStrategyData {
    op: MainStrategyOps,
    data: any,
    internal: true
}

/**
 * Type for raw ipc messages of cluster <- thread
 */
export interface ThreadStrategyData {
    op: ThreadStrategyOps,
    event: WebSocketShardEvents,
    data: any,
    shardId: number,
    internal: true
}

/**
 * Data structure representing an internal event
 */
export interface InternalOpsData {
    op: InternalOps,
    data: any,
    internal: true
}

/**
 * Data structure representing an internal discord.js event
 */
export interface ClientEventData {
    op: ClientEvents,
    data: any,
    internal: true,
}

/**
 * Data structure representing an internal error
 */
export interface IpcErrorData {
    name: string;
    reason: string;
    stack: string;
}

/**
 * Data structure representing user ipc data with abort signal attached to it
 */
export interface Transportable {
    content: any;
    repliable?: boolean;
    signal?: AbortSignal
}

/**
 * Data structure representing user ipc data
 */
export type Sendable = Omit<Transportable, 'signal'>;

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

export interface FetchResponse {
    code: number;
    message: string;
    body?: any;
}

/**
 * Wrapper function for fetching data using HTTP
 * @param url URL of resource to fetch
 * @param options RequestOptions to modify behavior
 * @returns A promise containing data fetched, or an error
 */
export function Fetch(url: string, options: RequestOptions): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
        let client;

        if (url.startsWith('https')) {
            client = Https.request;
        } else if (url.startsWith('http')) {
            client = Http.request;
        } else {
            throw new Error('Unknown url protocol');
        }

        const request = client(url, options, response => {
            const chunks: any[] = [];

            response.on('data', chunk => chunks.push(chunk));
            response.on('error', reject);
            response.on('end', () => {
                const code = response.statusCode ?? 500;
                const body = chunks.join('');
                resolve({ code, body,  message: response.statusMessage ?? '' });
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
    const response = await Fetch(url.toString(), {
        method: 'GET',
        headers: { authorization: `Bot ${token}` }
    });
    if (response.code >= 200 && response.code <= 299)
        return JSON.parse(response.body);
    else
        throw new Error(`Response received is not ok, code: ${response.code}`)
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
