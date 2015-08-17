/**
 * Created by toby on 14/08/15.
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
  var TrustedUserModel = require("../models/trustedUserModel");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  function TrustedUserProjection() {
    log("constructor");
    ProjectionQueue.call(this, TrustedUserModel);
  }
  util.inherits(TrustedUserProjection, ProjectionQueue);

  TrustedUserProjection.prototype.start = function() {
    var self = this;
    log("starting");

    // Listen for hub events.
    return ProjectionQueue.prototype.start.call(this, "TrustedUser");
  };

  TrustedUserProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;
    var lookup = {id: data.id};

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new TrustedUserModel();
        persist.id = data.id;
        persist.userId = data.userId;
        persist.owner = data.owner;
        persist.serviceProvider = data.serviceProvider;
        persist.issued = new Date(data.issued);
        persist.expires = new Date(data.expires);
        persist.status = data.status;
        promise = persist.saveAsync().catch(persistError);
        break;
      case "statusSet":
        promise = TrustedUserModel.findOneAsync({ id: data.id })
          .then(function(persist) { persist.status = data.status; return persist; })
          .then(function(persist) { return persist.saveAsync().return(persist); })
          .catch(persistError);
        break;
      case "deleted":
        promise = TrustedUserModel.findOneAsync({ id: data.id })
          .then(function(persist) { return persist.removeAsync().return(persist); })
          .catch(persistError);
        break;
      default:
        promise = Promise.reject(new Error(util.format("unrecognised trustedUser event: %s",data.__event)));
        break;
    }

    return promise;
  };

  return TrustedUserProjection;
}());