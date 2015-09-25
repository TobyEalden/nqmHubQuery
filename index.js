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
  var authServer = require("./lib/authServer");
  var readModels = require("nqm-read-model");
  var _models;

  var mongoose = require("mongoose");
  Promise.promisifyAll(mongoose);

  var db = mongoose.createConnection(config.db.url);
  db.on("error", function(err) {
    errLog("failed to connect to database at %s [%s]",config.db.url, err.message);
    throw err;
  });

  db.once("open", function() {
      log("database connected");
      _models = readModels(db);
      authServer.start(config.authServer)
        .then(function() {
          return queryListener.start(config.httpQueryListener, _models)
        })
        .catch(function(err) {
          errLog("fatal error: %s",err.message);
          errLog(err.stack);
          process.exit();
        });
  });

}());
