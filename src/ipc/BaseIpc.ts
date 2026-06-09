import type { Serializable } from "node:child_process";
import { randomUUID } from "node:crypto";
import type EventEmitter from "node:events";
import type { Indomitable } from "../Indomitable.js";
import type {
	InternalAbortSignal,
	InternalPromise,
	IpcErrorData,
	Message,
	RawIpcMessage,
	SavePromiseOptions,
	Transportable,
} from "../Util.js";
import { LibraryEvents, RawIpcMessageType } from "../Util.js";

/**
 * Base class where primary and worker ipc inherits
 */
export abstract class BaseIpc {
	public readonly manager: EventEmitter | Indomitable;

	protected readonly promises: Map<string, InternalPromise>;

	protected constructor(manager: EventEmitter | Indomitable) {
		this.manager = manager;
		this.promises = new Map();
	}

	/**
	 * Number of promises pending to be resolved
	 */
	public get pendingPromises(): number {
		return this.promises.size;
	}

	/**
	 * Rejects all the pending promises
	 */
	public flushPromises(reason: string): void {
		const error = new Error(reason);
		for (const promise of this.promises.values()) {
			if (promise.controller) {
				promise.controller.signal.removeEventListener("abort", promise.controller.listener);
			}

			promise.reject(error);
		}

		this.promises.clear();
	}

	/**
	 * Raw send method without abort controller handling
	 *
	 * @param transportable Data to send
	 */
	public async send(transportable: Transportable): Promise<unknown | undefined> {
		return new Promise((resolve, reject) => {
			if (!this.available()) {
				resolve(undefined);
				return;
			}

			const repliable = transportable.repliable || false;
			const id = repliable ? randomUUID() : null;
			const data: RawIpcMessage = {
				id,
				content: transportable.content,
				internal: true,
				type: RawIpcMessageType.MESSAGE,
			};
			this.sendData(data);
			if (!id) {
				resolve(undefined);
				return;
			}

			this.waitForPromise({ id, resolve, reject, signal: transportable.signal });
		});
	}

	/**
	 * Taps into message event of worker or primary process to handle ipc communication
	 *
	 * @internal
	 */
	// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
	public async handleRawResponse(data: Serializable, errorCallback: (error: unknown) => any): Promise<boolean | void> {
		try {
			this.manager.emit(LibraryEvents.RAW, data);
			if (!(data as any).internal) {
				return;
			}

			switch ((data as RawIpcMessage).type) {
				case RawIpcMessageType.MESSAGE: {
					await this.handleUnparsedMessage(data as RawIpcMessage);
					return;
				}

				case RawIpcMessageType.RESPONSE:
				case RawIpcMessageType.ERROR: {
					this.handlePromise(data as RawIpcMessage);
				}
			}
		} catch (error: unknown) {
			errorCallback(error);
		}
	}

	protected waitForPromise(options: SavePromiseOptions): void {
		let controller: InternalAbortSignal | undefined;
		if (options.signal) {
			const listener = () => {
				this.promises.delete(options.id);
				options.reject(new Error("This operation is aborted"));
			};

			controller = {
				listener,
				signal: options.signal,
			};
			controller.signal.addEventListener("abort", listener);
		}

		this.promises.set(options.id, { resolve: options.resolve, reject: options.reject, controller } as InternalPromise);
	}

	private handlePromise(data: RawIpcMessage): void {
		const id = data.id as string;
		const promise = this.promises.get(id);
		if (!promise) {
			return;
		}

		this.promises.delete(id);
		if (promise.controller) {
			promise.controller.signal.removeEventListener("abort", promise.controller.listener);
		}

		if (data.type === RawIpcMessageType.ERROR) {
			const content = data.content as IpcErrorData;
			const error = new Error(content.reason);
			error.stack = content.stack;
			error.name = content.name;
			promise.reject(error);
			return;
		}

		promise.resolve(data.content);
	}

	private async handleUnparsedMessage(data: RawIpcMessage): Promise<void> {
		const reply = (content: any) => {
			if (!data.id) {
				return;
			}

			const response: RawIpcMessage = {
				id: data.id,
				content,
				internal: true,
				type: RawIpcMessageType.RESPONSE,
			};
			this.sendData(response);
		};

		const message: Message = {
			repliable: Boolean(data.id),
			content: data.content,
			reply,
		};
		if (!data.content.internal) {
			this.emitMessage(message);
			return;
		}

		try {
			await this.handleMessage(message);
		} catch (error: any) {
			if (!message.repliable) {
				return;
			}

			const response: RawIpcMessage = {
				id: data.id,
				content: {
					name: error.name,
					reason: error.reason,
					stack: error.stack,
				},
				internal: true,
				type: RawIpcMessageType.ERROR,
			};
			this.sendData(response);
		}
	}

	protected emitMessage(message: Message): void {
		this.manager.emit(LibraryEvents.MESSAGE, message);
	}

	protected abstract available(): boolean;
	protected abstract sendData(data: RawIpcMessage): void;
	protected abstract handleMessage(message: Message): Promise<void>;
}
