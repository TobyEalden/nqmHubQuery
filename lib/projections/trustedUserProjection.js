/**
 * Created by toby on 14/08/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:TrustedUserProjection");
  var errLog = require("debug")("nqmQueryHub:error:TrustedUserProjection");
  var Promise = require("bluebird");
  var ProjectionQueue = require("./projectionQueue");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var TrustedUserModel = require("../models/trustedUserModel");
  var permissions = require("../permissions");

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
        // TODO - check if expiry has already happened and update status.
        var persist = new TrustedUserModel();
        persist.id = data.id;
        persist.userId = data.userId;
        persist.owner = data.owner;
        persist.serviceProvider = data.serviceProvider;
        persist.server = data.server;
        persist.issued = new Date(data.issued);
        persist.expires = new Date(data.expires);
        persist.status = data.status;
        persist.remoteStatus = data.remoteStatus;
        promise = persist.saveAsync().then(function() {
          return permissions.newTrustedUser(persist).return(persist);
        }).catch(persistError);
        break;
      case "updated":
        promise = TrustedUserModel.findOneAsync({ id: data.id })
          .then(function(persist) {
            persist.status = data.status || persist.status;
            persist.remoteStatus = data.remoteStatus || persist.remoteStatus;
            persist.server = data.server || persist.server;
            return persist;
          })
          .then(function(persist) { return persist.saveAsync().return(persist); })
          .catch(persistError);
        break;
      case "statusSet":
        promise = TrustedUserModel.findOneAsync({ id: data.id })
          .then(function(persist) { persist.status = data.status; return persist; })
          .then(function(persist) { return persist.saveAsync().return(persist); })
          .catch(persistError);
        break;
      case "deleted":
        // TODO - delete all share tokens that reference this trusted user?
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