/**
 * Created by toby on 27/06/15.
 */

"use strict";

(function() {
  var log = require("debug")("nqm-query:index");
  var errLog = require("debug")("nqm-query:error");
  var Promise = require("bluebird");
  var config = require("./config.json");
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
      log("database connected");
      queryListener.start(config.httpQueryListener)
      .catch(function(err) {
        errLog("fatal error: %s",err.message);
        errLog(err.stack);
        process.exit();
      });
  });

}());
