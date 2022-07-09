import { Indomitable } from '../Indomitable';
import { Transportable } from '../Util';

export class MainUtil {
    public readonly manager: Indomitable;
    constructor(manager: Indomitable) {
        this.manager = manager;
    }

    public send(id: number, transportable: Transportable): Promise<any|undefined> {
        const cluster = this.manager.clusters!.get(id);
        if (!cluster) return Promise.reject(new Error('Invalid cluster id provided'));
        return cluster.ipc.send(transportable);
    }

    public async broadcast(transportable: Transportable): Promise<any[]|undefined> {
        const results = await Promise.all([...this.manager.clusters!.values()].map(cluster => cluster.ipc.send(transportable)));
        if (!transportable.repliable) return;
        return results.filter(result => result !== undefined);
    }
}
