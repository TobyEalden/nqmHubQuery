/**
 * Created by toby on 27/06/15.
 */

"use strict";

(function() {
  var log = require("debug")("nqmQueryHub:index");
  var errLog = require("debug")("nqmQueryHub:error");
  var Promise = require("bluebird");
  var config = require("./config.json");
  var eventBus = require("./lib/eventBusClient");
  var projections = require("./lib/projections");
  var QueryListener = require("./lib/httpQueryListener").Listener;
  var queryListener = new QueryListener();

  var mongoose = require("mongoose");
  Promise.promisifyAll(mongoose);

  var db = mongoose.connect(config.db.url).connection;
  db.on("error", function(err) {
    errLog("failed to connect to database at %s [%s]",config.db.url, err.message);
    throw err;
  });


  db.once("open", function() {
    eventBus.start(config.eventBus)
      .then(function() { return projections.start(); })
      .then(function() { return queryListener.start(config.httpQueryListener); })
      .catch(function(err) {
        errLog("fatal error: %s",err.message);
        errLog(err.stack);
        process.exit();
      });
  });

}());
