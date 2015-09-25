/**
 * Created by toby on 27/06/15.
 */

"use strict";

(function() {
  var log = require("debug")("nqm-query:index");
  var errLog = require("debug")("nqm-query:error");
  var config = require("./config.json");
  var queryListener = new (require("./lib/httpQueryListener").Listener)();
  var authServer = require("nqm-auth-server");
  var queryDB = require("nqm-read-model");

  queryDB.createConnection(config.db)
    .then(function() {
      return authServer.start(config.authServer, queryDB.db());
    })
    .then(function() {
      return queryListener.start(config.httpQueryListener)
    })
    .catch(function(err) {
      errLog("fatal error: %s",err.message);
      errLog(err.stack);
      process.exit();
    });
}());
