import { Indomitable } from '../Indomitable';
import { ClientEvents, InternalEvents, Transportable } from '../Util';
import { ShardClientUtil } from './ShardClientUtil';

export class ShardClient {
    public readonly client: any;
    public readonly clusterId: number;
    public constructor(public manager: Indomitable) {
        const env = process.env;
        const clientOptions = manager.clientOptions as any || {};
        clientOptions.shards = env.SHARDS!.split(' ').map(Number);
        clientOptions.shardCount = Number(env.SHARDS_TOTAL);
        const client = new manager.client(clientOptions);
        client.shard = new ShardClientUtil(manager, client);
        this.client = client;
        this.clusterId = Number(process.env.CLUSTER);
    }

    public async start(token: string): Promise<void> {
        const shardClientUtil = this.client.shard as ShardClientUtil;
        await shardClientUtil.ipc.connection.connect();
        this.client.once('ready', () => shardClientUtil.send(this.createTransportable({ op: ClientEvents.READY, data: { clusterId: this.clusterId }})));
        this.client.on('shardReady', (shardId: number) => shardClientUtil.send(this.createTransportable({ op: ClientEvents.SHARD_READY, data: { clusterId: this.clusterId, shardId }})));
        this.client.on('shardReconnecting', (shardId: number) => shardClientUtil.send(this.createTransportable({ op: ClientEvents.SHARD_RECONNECT, data: { clusterId: this.clusterId, shardId }})));
        this.client.on('shardResume', (shardId: number, replayed: number) => shardClientUtil.send(this.createTransportable({ op: ClientEvents.SHARD_RESUME, data: { clusterId: this.clusterId, shardId, replayed }})));
        this.client.on('shardDisconnect', (event: CloseEvent, shardId: number) => shardClientUtil.send(this.createTransportable({ op: ClientEvents.SHARD_DISCONNECT, data: { clusterId: this.clusterId, shardId, event }})));
        await this.client.login(token);
    }

    private createTransportable(partial: any): Transportable {
        const content: InternalEvents = { ...partial, internal: true };
        return { content, repliable: false } as Transportable;
    }
}
