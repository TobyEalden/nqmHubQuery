/**
 * Created by toby on 04/08/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:IOTFeedProjection");
  var errLog = require("debug")("nqmQueryHub:error:IOTFeedProjection");
  var Promise = require("bluebird");
  var ProjectionQueue = require("./projectionQueue");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var AccountModel = require("../models/accountModel");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  function AccountProjection() {
    log("constructor");
    ProjectionQueue.call(this, AccountModel);
  }
  util.inherits(AccountProjection, ProjectionQueue);

  AccountProjection.prototype.start = function() {
    log("starting");

    // Listen for hub events.
    return ProjectionQueue.prototype.start.call(this, "Account");
  };

  AccountProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;
    var lookup = {id: data.id};

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new AccountModel();
        persist.id = data.id;
        persist.email = data.email;
        persist.authId = data.authId;
        promise = persist.saveAsync().catch(persistError);
        break;
      default:
        promise = Promise.reject(new Error(util.format("unrecognised account event: %s",data.__event)));
        break;
    }

    return promise;
  };

  return AccountProjection;
}());