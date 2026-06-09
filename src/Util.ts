import Http from "node:http";
import type { RequestOptions } from "node:https";
import Https from "node:https";
import process from "node:process";
import type { WebSocketShardEvents } from "@discordjs/ws";

/**
 * Hoisted Environmental Variable for ease of fetching
 */
export const EnvProcessData = {
	clusterId: Number(process.env.INDOMITABLE_CLUSTER ?? 0),
	clusterCount: Number(process.env.INDOMITABLE_CLUSTER_TOTAL ?? 0),
	shardIds: (process.env.INDOMITABLE_SHARDS ?? "").split(" ").map(Number),
	shardCount: Number(process.env.INDOMITABLE_SHARDS_TOTAL ?? 0),
};

/**
 * Internal operation codes for the cluster -> thread
 */
export enum MainStrategyOps {
	CONNECT = "connect",
	DESTROY = "destroy",
	RECONNECT = "reconnect",
	SEND = "send",
	STATUS = "status",
}

/**
 * Internal operation codes for the thread <- cluster
 */
export enum ThreadStrategyOps {
	CANCEL_IDENTIFY = "cancelIdentify",
	REQUEST_IDENTIFY = "requestIdentify",
	RETRIEVE_SESSION = "retrieveSession",
	SHARD_EVENT = "shardEvent",
	UPDATE_SESSION = "updateSession",
}

/**
 * Internal operation codes
 */
export enum InternalOps {
	DESTROY_CLIENT = "destroyClient",
	EVAL = "eval",
	PING = "ping",
	RESTART = "restart",
	RESTART_ALL = "restartAll",
	SESSION_INFO = "sessionInfo",
}

/**
 * Events for internal use
 */
export enum ClientEvents {
	ERROR = "ERROR",
	READY = "ready",
	SHARD_DISCONNECT = "shardDisconnect",
	SHARD_READY = "shardReady",
	SHARD_RECONNECT = "shardReconnect",
	SHARD_RESUME = "shardResume",
}

/**
 * Events emitted by Indomitable
 */
export enum LibraryEvents {
	CLIENT_READY = "clientReady",
	DEBUG = "debug",
	ERROR = "error",
	MESSAGE = "message",
	RAW = "raw",
	SHARD_DISCONNECT = "shardDisconnect",
	SHARD_READY = "shardReady",
	SHARD_RECONNECT = "shardReconnect",
	SHARD_RESUME = "shardResume",
	WORKER_EXIT = "workerExit",
	WORKER_FORK = "workerFork",
	WORKER_READY = "workerReady",
}

/**
 * Type for raw ipc message
 */
export enum RawIpcMessageType {
	ERROR = "error",
	MESSAGE = "message",
	RESPONSE = "response",
}

/**
 * Type for raw ipc messages of cluster -> thread
 */
export interface MainStrategyData {
	data: any;
	internal: true;
	op: MainStrategyOps;
}

/**
 * Type for raw ipc messages of cluster <- thread
 */
export interface ThreadStrategyData {
	data: any;
	event: WebSocketShardEvents;
	internal: true;
	op: ThreadStrategyOps;
	shardId: number;
}

/**
 * Data structure representing an internal event
 */
export interface InternalOpsData {
	data: any;
	internal: true;
	op: InternalOps;
}

/**
 * Data structure representing an internal discord.js event
 */
export interface ClientEventData {
	data: any;
	internal: true;
	op: ClientEvents;
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
	signal?: AbortSignal;
}

/**
 * Data structure representing user ipc data
 */
export type Sendable = Omit<Transportable, "signal">;

/**
 * Data structure representing an internal abort data
 */
export interface InternalAbortSignal {
	listener(): void;
	signal: AbortSignal;
}

export interface SavePromiseOptions {
	id: string;
	reject(reason: unknown): void;
	resolve(data: unknown): void;
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
	controller?: InternalAbortSignal;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	reject: Function;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	resolve: Function;
}

/**
 * Data structure representing internal IPC data
 */
export interface RawIpcMessage {
	content: any;
	id: string | null;
	internal: true;
	type: RawIpcMessageType;
}

/**
 * Data structure representing an IPC message
 */
export interface Message {
	content: any;
	repliable: boolean;
	reply(data: any): void;
}

/**
 * Data structure representing a Discord session
 */
export interface SessionObject {
	session_start_limit: {
		max_concurrency: number;
		remaining: number;
		reset_after: number;
		total: number;
	};
	shards: number;
	url: string;
}

export interface FetchResponse {
	body?: any;
	code: number;
	message: string;
}

/**
 * Wrapper function for fetching data using HTTP
 *
 * @param url URL of resource to fetch
 * @param options RequestOptions to modify behavior
 * @returns A promise containing data fetched, or an error
 */
export async function Fetch(url: string, options: RequestOptions): Promise<FetchResponse> {
	return new Promise((resolve, reject) => {
		let client;

		if (url.startsWith("https")) {
			client = Https.request;
		} else if (url.startsWith("http")) {
			client = Http.request;
		} else {
			throw new Error("Unknown url protocol");
		}

		const request = client(url, options, (response) => {
			const chunks: any[] = [];

			response.on("data", (chunk) => chunks.push(chunk));
			response.on("error", reject);
			response.on("end", () => {
				const code = response.statusCode ?? 500;
				const body = chunks.join("");
				resolve({ code, body, message: response.statusMessage ?? "" });
			});
		});

		request.on("error", reject);
		request.end();
	});
}

/**
 * Fetch sessions from discord
 *
 * @param token Bot token
 * @returns A promise containing a session object
 */
export async function FetchSessions(token: string): Promise<SessionObject> {
	const url = new URL("https://discord.com/api/v10/gateway/bot");
	const response = await Fetch(url.toString(), {
		method: "GET",
		headers: { authorization: `Bot ${token}` },
	});
	if (response.code >= 200 && response.code <= 299) {
		return JSON.parse(response.body);
	} else {
		throw new Error(`Response received is not ok, code: ${response.code}`);
	}
}

/**
 * Modify an array to contain the specified amount of chunks
 *
 * @param original An array of data
 * @param chunks The amount of chunks to transform into
 * @returns A modified array
 */
export function Chunk(original: any[], chunks: number): any[] {
	const array = [];
	for (let i = 0; i < original.length; i += chunks) {
		array.push(original.slice(i, i + chunks));
	}

	return array;
}

/**
 * Wait for a specific amount of time (timeout)
 *
 * @param ms Time to wait in milliseconds
 * @returns A promise that resolves in x seconds
 */
export async function Delay(ms: number): Promise<void> {
	// eslint-disable-next-line no-promise-executor-return
	return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

/**
 * Creates an abortable request with controller and timeout
 *
 * @param delay Time before an abort error throws
 * @returns An abortable data with controller and timeout
 */
export function MakeAbortableRequest(delay: number): AbortableData {
	const controller = new AbortController();
	const seconds = Math.round(delay / 1_000);
	const timeout = setTimeout(
		() => controller.abort(new Error(`The request has been aborted in ${seconds} second(s)`)),
		delay,
	);
	return { controller, timeout };
}
