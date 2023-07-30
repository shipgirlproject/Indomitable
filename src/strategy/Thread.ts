import { WebSocketShardEvents } from '@discordjs/ws';
import { WebsocketShard } from 'kearsarge';
import { workerData } from 'worker_threads';
import { WorkerData } from './IndomitableStrategy';
import { IndomitableFetchingStrategy } from './IndomitableFetchingStrategy';
import { ThreadStrategyWorker } from '../ipc/ThreadStrategyWorker';
import { ThreadStrategyData, ThreadStrategyOps } from '../Util';

const options = workerData as WorkerData;

const ipc = new ThreadStrategyWorker();
const strategy = new IndomitableFetchingStrategy(ipc, options);
const shard = new WebsocketShard(options.shardId, strategy);

// @ts-expect-error: compatible class
ipc.build(shard);

for (const event of Object.values(WebSocketShardEvents)) {
    // @ts-expect-error: unknown fix
    shard.on(event, data => {
        const content: ThreadStrategyData = {
            op: ThreadStrategyOps.SHARD_EVENT,
            event,
            data,
            shardId: shard.id,
            internal: true
        };
        ipc.send({ content })
            .catch(() => null);
    });
}





