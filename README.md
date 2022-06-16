## Indomitable

> A lightweight (the actual ship is heavy though), performat & powerful sharder for Discord.JS. Indomitable uses cluster module to evenly spread her weight (load) across your cores

<p align="center">
    <img src="https://cdn.donmai.us/original/9b/cf/__indomitable_azur_lane_drawn_by_kincora__9bcf19b2f822ce75ea707e5047882d6a.png"> 
</p>

> The ShipGirl Project; ⓒ Azur Lane

* Supports Discord.JS `v13` and `discord.js@dev`

## Installation

* Stable

> `npm install indomitable`

* Dev

> `npm install https://github.com/Deivu/Indomitable.git#master`

## Example Usage

> Basic usage
```js
const { Indomitable } = require('indomitable');
const { Client } = require('discord.js');
const token = 'your_token';

const manager = new Indomitable({ client: Client, token })
    .on('error', console.error);

manager.spawn();
```

> Broadcasteval as one way to get data across shards
```js
// Saya's note:
// Not recommended as every broadcastEval uses eval() internally
// Consider learning the ipc system of this library in future to get data across your clusters
client.shard
    .broadcastEval(client => client.guilds.cache.size)
    .then(console.log);
```

### Notes

* You don't need to call `client.login('token');` yourself, Indomitable will call it for you.

* Extended clients that extend from discord.js client will work, as long as you use `client.login('token');` to get your bot running

* For fastest performance possible, install the optional dependency **MessagePack** `npm i --save msgpackr`

* Docs like on [Shoukaku](https://github.com/Deivu/Shoukaku) soon:tm:

### Indomitable Options
 Option | Type | Description | Required | Default |
--------|------|-------------|----------|---------|
clusterCount | number or 'auto' | How many clusters we should spawn | No  | 'auto'
shardCount | number or 'auto' | How many websocket shards we should make | No | 'auto'
clientOptions | Object | Discord.JS Client Options | No | {}
ipcOptions | Object{primary?: {}, worker?: {}} | Options for net-ipc | No | {}
nodeArgs | string[] | Node arguments to pass to a cluster | No | []
ipcTimeout | number | Timeout before we fail a request | No | 60000
spawnTimeout | number | Timeout before we fail a cluster spawn | No | 60000 (multiplied by clusterShardCount internally)
spawnDelay | number | Time to wait before spawning a new cluster | No | 5000
retryFailed | boolean | If you want to respawn failed clusters on `Indomitable.spawn()` | No | true
autoRestart | boolean | If you want to auto restart the shards that have been killed unintentionally | No | false
client | Client | Your Discord.JS non modified OR modified client | Yes | None |
token | strubg | The token of your bot | Yes | None |

### Made with ❤ by
> @Sāya#0113 (https://github.com/Deivu/) | Inspired by Kurasuta
