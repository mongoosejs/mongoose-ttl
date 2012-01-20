
var mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , ttl = require('../')
  , should = require('should')

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
        should.exist(T.__ttl);
        done();
      });
    });
  });

  describe('Model.find', function () {

    it('includes active ttls', function (done) {
      var t = new T({ name: 'vanilla latte' });
      t.save(function (err) {
        if (err) return done(err);

        T.find({ name: /latte$/ }).run(function (err, docs) {
          if (err) return done(err);
          docs.length.should.equal(1)
          t.id.should.equal(docs[0].id);
          done();
        });
      });
    });

    it('excludes expired ttls', function (done) {
      var t = new T({ name: 'Tha Blob' });
      t.save(function (err) {
        if (err) return done(err);

        setTimeout(function () {
          T.find({ name: 'Tha Blob' }).run(function (err, docs) {
            if (err) return done(err);
            docs.length.should.equal(0)
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
        should.strictEqual(null, err);
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
        should.strictEqual(null, err);
        docs.length.should.equal(1);
        t.id.should.equal(docs[0].id);
        if (!--pending) done();
      });

      T.findOne({ name: 'Tha Blob' }, function (err, doc) {
        should.strictEqual(null, err);
        t.id.should.equal(doc.id);
        if (!--pending) done();
      });

      T.count({}, function (err, n) {
        should.strictEqual(null, err);
        n.should.equal(1);
        if (!--pending) done();
      });

      T.find().where('name', 'Tha Blob').run(function (err, docs) {
        should.strictEqual(null, err);
        docs.length.should.equal(1);
        t.id.should.equal(docs[0].id);
        if (!--pending) done();
      });

      T.distinct('name', { _id: { $exists: true }}, function (err, t) {
        should.strictEqual(null, err);
        t.length.should.equal(1);
        t[0].should.equal('Tha Blob');
        if (!--pending) done();
      });

      T.$where('this.name == "Tha Blob"').exec(function (err, docs) {
        should.strictEqual(null, err);
        docs.length.should.equal(1);
        t.id.should.equal(docs[0].id);
        if (!--pending) done();
      });

      T.find({ __ttl: { $exists: true } }).exec(function (err, docs) {
        should.strictEqual(null, err);
        docs.length.should.equal(1);
        t.id.should.equal(docs[0].id);
        if (!--pending) done();
      });
    });

    it('should convert __ttl params to $and arrays', function () {
      var query = T.find({ __ttl: { $exists: true } });
      var c = query._conditions;
      c.should.have.property('$and');
      c.$and.length.should.equal(2);
      c.$and.forEach(function (arg) {
        arg.should.have.property('__ttl');
      });
    });
  });

  describe('virtuals', function () {
    describe('getters', function () {
      it('should return the current ttl', function () {
        var t = new T;
        t.ttl.should.be.an.instanceof(Date);
      });
    });

    describe('setters', function () {
      it('should set ttl to the value + the current date', function () {
        var now = Date.now();
        var t = new T;

        (t.ttl - (now + 1000)).should.be.below(4);
        t.ttl = '2s';
        (t.ttl - (now + 2000)).should.be.below(4);
        t.ttl = 3001;
        (t.ttl - (now + 3001)).should.be.below(4);
        t.ttl = '500ms';
        (t.ttl - (now + 500)).should.be.below(4);
      });

      it('should honor the ttl', function (done) {
        this.timeout(5000);
        var t = new T;
        t.ttl = 2000;
        var pending = 2;

        t.save(function (err) {
          should.strictEqual(null, err);
        });

        setTimeout(function () {
          T.findById(t, function (err, b) {
            should.strictEqual(null, err);
            should.exist(b);
            finish();
          });
        }, 1200);

        setTimeout(function () {
          T.findById(t, function (err, b) {
            should.strictEqual(null, err);
            should.not.exist(b);
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
      ;(t.ttl - (now + 172800000)).should.be.below(4);
      t.resetTTL();
      ;(t.ttl - (now + 1000)).should.be.below(4);
    });
  });

  describe('reaper', function () {

    it('should remove all expired docs', function (done) {
      this.timeout(interval * 3);
      T.create({ name: 'Interval reaped' }, function (err, t) {
        should.strictEqual(null, err);

        setTimeout(function () {
          reaper.once('reap', function () {
            T.collection.count(function (err, count) {
              should.strictEqual(err, null);
              count.should.equal(0);
              done();
            });
          });
        }, interval + 10);

      });
    });

    it('should fire the optional callback', function () {
      reaperCb.should.be.true;
    });

    it('should be disabled', function () {
      T.should.have.property('__ttl');
      T.stopTTLReaper();
      T.should.not.have.property('__ttl');

      T.create({ name: 'reaper killed' }, function (err, t) {
        should.strictEqual(null, err);

        setTimeout(function () {
          T.collection.count(function (err, count) {
            should.strictEqual(err, null);
            count.should.equal(1);
            done();
          });
        }, interval + 10);

      });
    });
  });

  after(function () {
    describe('ttl index', function () {
      it('should be created', function (done) {
        indexCreated.should.be.true;
        T.collection.getIndexes({ full: true }, function (err, indexes) {
          if (err) return done(err);

          var index = indexes.filter(function (idx) {
            return '__ttl_1' === idx.name;
          })[0];

          should.exist(index);
          index.background.should.be.true;
          mongoose.disconnect(done);
        });
      });
    });
  });

});
