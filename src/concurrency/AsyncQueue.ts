import { EventEmitter, once } from 'events';

export declare interface AsyncQueueWaitOptions {
    signal?: AbortSignal | undefined;
}

export declare interface AsyncQueueEmitter extends EventEmitter {
    on(event: 'resolve', listener: (message: string) => void): this;
    once(event: 'resolve', listener: (message: string) => void): this;
    off(event: 'resolve', listener: (event: unknown) => void): this;
}

export class AsyncQueue {
    private queue: AsyncQueueEmitter[];
    constructor() {
        this.queue = [];
    }

    public get remaining(): number {
        return this.queue.length;
    }

    public wait({ signal }: AsyncQueueWaitOptions): Promise<void[]> {
        const next = this.remaining ? once(this.queue[this.remaining - 1], 'resolve', { signal }) : Promise.resolve([]);
        
        const emitter: AsyncQueueEmitter = new EventEmitter();
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
