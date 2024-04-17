export class ExtendedMap extends Map {
    public ensure<K, V>(key: K, generator: (key: K, collection: ExtendedMap) => V): V {
        let value = this.get(key)
        if (value) return value;

        value = generator(key, this);
        this.set(key, value)
        
        return value;
    }
}