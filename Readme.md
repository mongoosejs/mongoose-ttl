#Mongoose-TTL Plugin

Provides time-to-live support for [Mongoose](http://mongoosejs.com).

[![Build Status](https://secure.travis-ci.org/aheckmann/mongoose-ttl.png)](http://travis-ci.org/aheckmann/mongoose-ttl)

Options:

  - ttl: the time each doc should live in the db (default 60 seconds)
  - interval: how often the expired doc reaper runs (default 5 mins)
  - reap: enable the expired doc reaper (default true)
  - onReap: callback passed to reaper execution

Example:

```js
var schema = new Schema({..});
schema.plugin(ttl, { ttl: 5000 });
```

The ttl option supports the ms module by [guille](https://github.com/guille) meaning
we can specify ttls with friendlier syntax. Example:

```
 value     milliseconds
========================
 '2d'      172800000
 '1.5h'    5400000
 '1h'      3600000
 '1m'      60000
 '5s'      5000
 '500ms'   500
 100       100
```

The expired document reaper can be disabled by passing `reap: false`.
Useful when working in multi-core environments when we only want one
process executing it.

```js
var schema = new Schema({..});
schema.plugin(ttl, { ttl: 5000, reap: false });
var Cache = db.model('Cache', schema);
if (isMyWorker) Cache.startTTLReaper();
```

The reaper can also be stopped.

```js
Cache.stopTTLReaper();
```

Time-to-live is specified at the collection level, however
it can also be overridden for a given document.

```js
var cache = new Cache;
cache.ttl = '2m' // lives for two minutes
cache.save();
```

We can also reset the ttl for a given document to its
default plugin state.

```js
cache.resetTTL();
```
## Mongoose Version
>= 2.5.2

### MongoDB TTL collections
MongoDB is getting official support for TTL collections [soon-ish](https://github.com/mongodb/mongo/commit/25bdc679a0e559d64ec7f22b0468cf5b1671c4e7) at which point this plugin will need to change.

[LICENSE](https://github.com/aheckmann/mongoose-ttl/blob/master/LICENSE)
