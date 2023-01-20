## Indomitable

> A lightweight (the actual ship is heavy though), performant, powerful & no dependency sharder for Discord.JS
<p align="center">
    <img src="https://cdn.donmai.us/original/9b/cf/__indomitable_azur_lane_drawn_by_kincora__9bcf19b2f822ce75ea707e5047882d6a.png"> 
</p>

> The ShipGirl Project; ⓒ Azur Lane

* Supports Discord.JS `v13` and `v14`

## Features

* Fast

* Lightweight

* Reliable

* ESM & CommonJS supported

* Promisified IPC (Bi-directional)

* No dependencies (v2 onwards)

* Very cute (and lazy like the Kaiju Princess! *If you know, you know*)

## Used in prod by the ff:

> Chip (https://chipbot.gg/)

> Kashima (https://kashima.saya.moe/) 

> Or add your own!

## Installation

* Stable

> `npm install indomitable`

* Dev

> `npm install https://github.com/Deivu/Indomitable.git#master`

## Documentation

🔗 https://deivu.github.io/Indomitable/index.html

> Don't forget to read my "Notes" below!

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

> Basic usage with more Indomitable Options
```js
const { Indomitable } = require('indomitable');
const { Client } = require('discord.js');
const token = 'your_token';

const options = {
    // Processes to run
    clusterCount: 2,
    // Websocket shards to run
    shardCount: 8,
    // Discord.JS options
    clientOptions: {
        intents: [1 << 0] // Bitwise for GUILD intent only
    },
    // Auto restart processes that have been killed
    autoRestart: true, // This defaults to false by default unless you specify it
    // Your Discord.JS client
    client: Client,
    // Your bot token
    token
}

const manager = new Indomitable(options)
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

> Example of a very basic ipc comunication (non repliable)
```js
// Primary Process
indomitable.on('message', message => {
    if (message.content.op === 'something') {
        doSomething();
    }
});
// Worker Process (your client most likely)
client.shard.send({ content: { op: 'something' } })
    .catch(console.error);
```

> Example of a very basic ipc comunication (repliable)
```js
// Primary Process
indomitable.on('message', message => {
    if (message.content.op === 'something') {
        if (!message.repliable) return; // check if the message is repliable just incase, though it won't error even it is not
        const someValue = doSomething();
        message.reply(someValue);
    }
});
// Worker Process (your client most likely)
client.shard.send({ content: { op: 'something' }, repliable: true })
    .then(console.log)
    .catch(console.error);
```

> You could also do it reversely (main process asking data from clusters instead of clusters asking to main process)
```js
// Primary Process
// send to specific cluster 
indomitable.ipc.send(0, { content: { op: 'nya' } })
    .catch(console.error);
// send to specific cluster with repliable
indomitable.ipc.send(0, { content: { op: 'something' }, repliable: true })
    .then(console.log);
    .catch(console.error);
// broadcast to all clusters
indomitable.ipc.broadcast({ content: { op: 'meow' } })
    .catch(console.error);
// broadcast to all clusters with repliable is possible as well
indomitable.ipc.broadcast({ content: { op: 'meow' }, repliable: true })
    .then(console.log);
    .catch(console.error);

// Worker Process (your client most likely)
client.shard.on('message', message => {
    if (message.content.op === 'something') {
        if (!message.repliable) return;
        const someValue = doSomething();
        message.reply(someValue);
    }
    if (message.content.op === 'nya') {
        doSomething();
    }
    if (message.content.op === 'meow') {
        if (!message.repliable) return;
        message.reply('nya');
    }
})
```

### Notes

* You don't need to call `client.login('token');` yourself, Indomitable will call it for you.

* Extended clients that extend from discord.js client will work, as long as you use `client.login('token');` to get your bot running

* Your Discord.JS Client ShardClientUtil is replaced with Indomitable's ShardClientUtil. Refer to our docs for documentation 🔗 https://deivu.github.io/Indomitable/classes/client_ShardClientUtil.ShardClientUtil.html

### Other Links

[Support](https://discord.gg/FVqbtGu) (#Development)

### Indomitable Options
 Option | Type | Description | Required | Default |
--------|------|-------------|----------|---------|
clusterCount | number or 'auto' | How many clusters we should spawn | No  | 'auto'
shardCount | number or 'auto' | How many websocket shards we should make | No | 'auto'
clientOptions | Object | Discord.JS Client Options | No | {}
clusterSettings | Object | Options for the forked process | No | {}
ipcTimeout | number | Timeout before we fail a request | No | 30000
spawnTimeout | number | Timeout before we fail a cluster spawn | No | 60000 (multiplied by clusterShardCount internally)
spawnDelay | number | Time to wait before spawning a new cluster | No | 5000
autoRestart | boolean | If you want to auto restart the shards that have been killed unintentionally | No | false
waitForReady | boolean | If you want to wait for cluster ready before spawning another cluster | No | true
client | Client | Your Discord.JS non modified OR modified client | Yes | None |
token | string | The token of your bot | Yes | None |

### Made with ❤ by @Sāya#0113 (https://github.com/Deivu/)
