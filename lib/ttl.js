
// todo
// mongoose-ttl
// mongoose-keywords
// mongoose-query-cache
// mongoose-timestamps (use createdAt as default name)
// mongoose-created
// more

// + tests <<== START HERE !!!!

var Model = require('mongoose').Model;

module.exports = exports = ttl;

function ttl (schema, options) {
  options || (options = {});

  var key = '__ttl' // non-configurable
    , ttl = options.ttl || 60000 // doc age limit
    , interval = options.interval || 60000*5 // how often to .remove() expired docs
    , cb = 'function' == typeof options.cb ? cb : undefined // reaper callback

  var o = {};
  o[key] = Date;

  schema.add(o);

  var index = {};
  index[key] = 1;
  schema.index(index);

  schema.pre('save', function (next) {
    this[key] = new Date;
    next();
  });

  function applyTTL (cond) {
    if (cond[key]) {
      cond.$and || (cond.$and = []);
      var a = {};
      a[key] = cond[key];
      cond.$and.push(a);
      var b = {};
      b[key] = { $gte: Date.now() - ttl };
      cond.$and.push(b);
      delete cond[key];
    } else {
      cond[key] = { $gte: Date.now() - ttl }
    }
  }

  /**
   * Override Model.init
   */

  schema.statics.init = function () {
    init(this);
    return Model.init.call(this);
  }

  /**
   * init
   *
   * Hook into all model queries to include the TTL
   * filter and kick off the expired doc reaper.
   */

  function init (model) {
    if (model.__ttl) return;

    var distinct_ = model.distinct;
    model.distinct = function (field, cond, cb) {
      applyTTL(cond);
      return distinct_.call(model, field, cond, cb);
    }

    'findOne find count'.split(' ').forEach(function (method) {
      var fn = model[method];

      model[method] = function (cond, fields, opts, cb) {
        if (!cond) {
          cond = {};
        } else if ('function' == typeof cond) {
          cb = cond;
          cond = {};
        }

        applyTTL(cond);
        return fn.call(model, cond, fields, opts, cb);
      }
    });

    'where $where'.split(' ').forEach(function (method) {
      var fn = model[method];
      model[method] = function () {
        var query = fn.apply(this, arguments)
          , cond = {};
        applyTTL(cond);
        return query.find(cond);
      }
    });

    startTTL(model);
  }

  /**
   * startTTL
   *
   * Initializes the timer which removes expired docs
   * from the DB.
   */

  function startTTL (model) {
    var remove;
    model.__ttl = setInterval(remove = function () {
      model
      .remove()
      .where(key).$lt(Date.now() - ttl)
      .exec(cb);
    }, interval);
    setTimeout(remove, 10000);
  }

  /**
   * clearTTL
   *
   * Stops hitting the db to remove expired docs.
   */

  schema.statics.clearTTL = function clearTTL () {
    clearInterval(this.__ttl);
  };

}
