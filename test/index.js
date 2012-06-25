
var mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , ttl = require('../')
  , assert = require('assert')

mongoose.connect('localhost', 'mongoose_test_ttl');

var ttl_ = 1000
  , interval = 1500
  , start = Date.now()

Date.prototype.inspect = function () {
  return '' + this.getTime();
}

var reaperCb = false;
var reaper = new (require('events').EventEmitter);
function log (err) {
  reaperCb = true;
  reaper.emit('reap');
}

var ThingSchema = new Schema({ name: String });
ThingSchema.plugin(ttl, { ttl: ttl_, interval: interval, onReap: log });
var T = mongoose.model('Thing', ThingSchema);

var indexCreated = false;
T.on('index', function () {
  indexCreated = true;
});

describe('ttl', function () {
  before(function (done) {
    mongoose.connection.on('open', function () {
      mongoose.connection.db.dropDatabase(function (err) {
        if (err) return done(err);
        assert.ok(T.__ttl);
        done();
      });
    });
  });

  describe('Model.find', function () {

    it('includes active ttls', function (done) {
      var t = new T({ name: 'vanilla latte' });
      t.save(function (err) {
        if (err) return done(err);

        T.find({ name: /latte$/ }).exec(function (err, docs) {
          if (err) return done(err);
          assert.equal(1, docs.length);
          assert.equal(t.id,docs[0].id);
          done();
        });
      });
    });

    it('excludes expired ttls', function (done) {
      var t = new T({ name: 'Tha Blob' });
      t.save(function (err) {
        if (err) return done(err);

        setTimeout(function () {
          T.find({ name: 'Tha Blob' }).exec(function (err, docs) {
            if (err) return done(err);
            assert.equal(0, docs.length);
            done();
          });
        }, ttl_ );
      });
    });

  });

  describe('Model queries', function () {
    var t;
    before(function (done) {
      T.create({ name: 'Tha Blob' }, function (err, t_) {
        assert.strictEqual(null, err);
        t = t_;
        done();
      });
    });

    after(function (done) {
      t.remove(done);
    });

    it('should not break existing query methods', function (done) {
      var pending = 7;

      T.where('name').exists().exec(function (err, docs) {
        assert.strictEqual(null, err);
        assert.equal(docs.length,1);
        assert.equal(t.id,docs[0].id);
        if (!--pending) done();
      });

      T.findOne({ name: 'Tha Blob' }, function (err, doc) {
        assert.strictEqual(null, err);
        assert.equal(t.id,doc.id);
        if (!--pending) done();
      });

      T.count({}, function (err, n) {
        assert.strictEqual(null, err);
        assert.equal(n,1);
        if (!--pending) done();
      });

      T.find().where('name', 'Tha Blob').exec(function (err, docs) {
        assert.strictEqual(null, err);
        assert.equal(docs.length,1);
        assert.equal(t.id,docs[0].id);
        if (!--pending) done();
      });

      T.distinct('name', { _id: { $exists: true }}, function (err, t) {
        assert.strictEqual(null, err);
        assert.equal(t.length,1);
        assert.equal(t[0],'Tha Blob');
        if (!--pending) done();
      });

      T.$where('this.name == "Tha Blob"').exec(function (err, docs) {
        assert.strictEqual(null, err);
        assert.equal(1, docs.length);
        assert.equal(t.id,docs[0].id);
        if (!--pending) done();
      });

      T.find({ __ttl: { $exists: true } }).exec(function (err, docs) {
        assert.strictEqual(null, err);
        assert.equal(docs.length,1);
        assert.equal(t.id,docs[0].id);
        if (!--pending) done();
      });
    });

    it('should convert __ttl params to $and arrays', function () {
      var query = T.find({ __ttl: { $exists: true } });
      var c = query._conditions;
      assert.ok(c.hasOwnProperty('$and'));
      assert.equal(c.$and.length,2);
      c.$and.forEach(function (arg) {
        assert.ok(arg.hasOwnProperty('__ttl'));
      });
    });
  });

  describe('virtuals', function () {
    describe('getters', function () {
      it('should return the current ttl', function () {
        var t = new T;
        assert.ok(t.ttl instanceof Date);
      });
    });

    describe('setters', function () {
      it('should set ttl to the value + the current date', function () {
        var now = Date.now();
        var t = new T;

        assert.ok((t.ttl - (now + 1000)) < 4);
        t.ttl = '2s';
        assert.ok((t.ttl - (now + 2000)) < 4);
        t.ttl = 3001;
        assert.ok((t.ttl - (now + 3001)) < 4);
        t.ttl = '500ms';
        assert.ok((t.ttl - (now + 500)) < 4);
      });

      it('should honor the ttl', function (done) {
        this.timeout(5000);
        var t = new T;
        t.ttl = 2000;
        var pending = 2;

        t.save(function (err) {
          assert.strictEqual(null, err);
        });

        setTimeout(function () {
          T.findById(t, function (err, b) {
            assert.strictEqual(null, err);
            assert.ok(b);
            finish();
          });
        }, 1200);

        setTimeout(function () {
          T.findById(t, function (err, b) {
            assert.strictEqual(null, err);
            assert.ok(!b);
            finish();
          });
        }, 2200);

        function finish () {
          if (--pending) return;
          done();
        }
      });
    });

  });

  describe('resetTTL', function () {
    it('should restore the plugin defaults', function () {
      var now = Date.now();
      var t = new T;
      t.ttl = '2d';
      assert.ok((t.ttl - (now + 172800000)) < 4);
      t.resetTTL();
      assert.ok((t.ttl - (now + 1000)) < 4);
    });
  });

  describe('reaper', function () {

    it('should remove all expired docs', function (done) {
      this.timeout(interval * 3);
      T.create({ name: 'Interval reaped' }, function (err, t) {
        assert.strictEqual(null, err);

        setTimeout(function () {
          reaper.once('reap', function () {
            T.collection.count(function (err, count) {
              assert.strictEqual(err, null);
              assert.equal(0, count);
              done();
            });
          });
        }, interval + 10);

      });
    });

    it('should fire the optional callback', function () {
      assert.strictEqual(true, reaperCb);
    });

    it('should be disabled', function () {
      assert.ok(T.hasOwnProperty('__ttl'));
      T.stopTTLReaper();
      assert.ok(!T.hasOwnProperty('__ttl'));

      T.create({ name: 'reaper killed' }, function (err, t) {
        assert.strictEqual(null, err);

        setTimeout(function () {
          T.collection.count(function (err, count) {
            assert.strictEqual(err, null);
            assert.equal(1, count);
            done();
          });
        }, interval + 10);

      });
    });
  });

  after(function () {
    describe('ttl index', function () {
      it('should be created', function (done) {
        assert.equal(true, indexCreated);
        T.collection.getIndexes({ full: true }, function (err, indexes) {
          if (err) return done(err);

          var index = indexes.filter(function (idx) {
            return '__ttl_1' === idx.name;
          })[0];

          assert.ok(index);
          assert.equal(true, index.background);
          mongoose.disconnect(done);
        });
      });
    });
  });

});
