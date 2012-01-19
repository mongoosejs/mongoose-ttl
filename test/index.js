
var mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , ttl = require('../')

function log (err) {
  console.error('reaper ran');
  console.error('error? %s', !!err);
  if (err) {console.error(err.stack);}
}

mongoose.set('debug', true);

var ThingSchema = new Schema({ name: String });
ThingSchema.plugin(ttl, { ttl: 10000, interval: 20000, cb: log });

mongoose.connect('localhost', 'mongoose_test_ttl');

var T = mongoose.model('Thing', ThingSchema);

mongoose.connection.on('open', function () {
  mongoose.connection.db.dropDatabase(function () {

    var t = new T({ name: 'Tha Blob' });
    t.save(function (err) {
      if (err) console.error(err.stack);

      T.find({ name: /Tha Blob/ }).run(function (err, t) {
        console.error('find', err, t);

        T.where('name').exists().exec(function (err, t) {
          console.error('where', err, t);

          T.findOne({ name: 'Tha Blob' }, function (err, t) {
            console.error('findOne', err, t);

            T.count({}, function (err, n) {
              console.error('count', err, n);

              T.find().where('name', 'Tha Blob').run(function (err, t) {
                console.error('find()', err, t);

                T.distinct('name', { _id: { $exists: true }}, function (err, t) {
                  console.error('distinct', err, t);
                });
              });
            });
          });
        });
      });
    });
  });
});

