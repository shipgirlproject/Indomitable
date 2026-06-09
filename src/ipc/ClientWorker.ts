import type { Indomitable } from "../Indomitable.js";
import type { InternalOpsData, Message } from "../Util.js";
import { InternalOps, LibraryEvents } from "../Util.js";
import type { ShardClientUtil } from "../client/ShardClientUtil.js";
import { BaseWorker } from "./BaseWorker.js";

const internalOpsValues = Object.values(InternalOps);

/**
 * Extended worker ipc class, shard client util ipc class
 */
export class ClientWorker extends BaseWorker {
	public constructor(
		public readonly shard: ShardClientUtil,
		manager: Indomitable,
	) {
		super(manager);
	}

	protected override emitMessage(message: Message): void {
		this.shard.emit(LibraryEvents.MESSAGE, message);
	}

	protected override async handleMessage(message: Message): Promise<void> {
		if (!internalOpsValues.includes(message.content.op)) {
			return;
		}

		const content = message.content as InternalOpsData;
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (content.op) {
			case InternalOps.EVAL:
				// @ts-expect-error: this is fine
				message.reply(this.shard.client._eval(content.data));
				break;
			case InternalOps.DESTROY_CLIENT:
				await this.shard.client!.destroy();
				message.reply(null);
		}
	}
}
