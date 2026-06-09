import type { Serializable } from "node:child_process";
import EventEmitter from "node:events";
import process from "node:process";
import type { Indomitable } from "../Indomitable.js";
import type { Message, RawIpcMessage } from "../Util.js";
import { BaseIpc } from "./BaseIpc.js";

/**
 * Basic worker ipc class, basic child process ipc handler
 */
export class BaseWorker extends BaseIpc {
	public constructor(manager: EventEmitter | Indomitable = new EventEmitter()) {
		super(manager);
		process.on("message", async (data) => this.handleRawResponse(data as Serializable, () => null));
	}

	protected available(): boolean {
		return Boolean(process.send);
	}

	protected sendData(data: RawIpcMessage): void {
		process.send!(data);
	}

	protected async handleMessage(_message: Message): Promise<void> {}
}
