import { EventEmitter, once } from 'node:events';

export declare interface AsyncQueueWaitOptions {
    signal?: AbortSignal | undefined;
}

export class AsyncQueue {
    private readonly queue: NodeJS.EventEmitter[];
    constructor() {
        this.queue = [];
    }

    public get remaining(): number {
        return this.queue.length;
    }

    public wait({ signal }: AsyncQueueWaitOptions): Promise<void[]> {

        const next = this.remaining ? once(this.queue[this.remaining - 1], 'resolve', { signal }) : Promise.resolve([]);
        
        const emitter = new EventEmitter() as NodeJS.EventEmitter;

        this.queue.push(emitter);

        if (signal) {
            const listener = () => {
                const index = this.queue.indexOf(emitter);
                if (index !== 1) this.queue.splice(index, 1);
            }
            signal.addEventListener('abort', listener);
        }

        return next
    }

    public shift(): void {
        const emitter = this.queue.shift();

        if (typeof emitter !== 'undefined') emitter.emit('resolve');
    }
}
