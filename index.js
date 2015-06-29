/**
 * Created by toby on 27/06/15.
 */

"use strict";

(function() {
  var log = require("debug")("index");
  var Promise = require("bluebird");
  var config = require("./config.json");
  var eventBus = require("./lib/busClient").EventBus;
  var projections = require("./lib/projections");
  var QueryListener = require("./lib/httpQueryListener").Listener;

  var mongoose = require("mongoose");
  Promise.promisifyAll(mongoose);

  var db = mongoose.connect(config.db.url).connection;
  db.on("error", function(err) {
    log("failed to connect to database at %s [%s]",config.db.url, err.message);
    throw err;
  });

  var queryListener = new QueryListener(config.httpQueryListener);

  db.once("open", function() {
    eventBus
      .then(function() { return projections.start(); })
      .then(function() { return queryListener.start(); })
      .catch(function(err) {
        log("fatal error: %s",err.message);
        throw err;
      });
  });

}());
