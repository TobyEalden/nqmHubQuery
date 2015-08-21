/**
 * Created by toby on 21/08/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:AccessTokenProjection");
  var errLog = require("debug")("nqmQueryHub:AccessTokenProjection:error");
  var Promise = require("bluebird");
  var ProjectionQueue = require("./projectionQueue");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var AccessTokenModel = require("../models/accessTokenModel");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  function AccessTokenProjection() {
    log("constructor");
    ProjectionQueue.call(this, AccessTokenModel);
  }
  util.inherits(AccessTokenProjection, ProjectionQueue);

  AccessTokenProjection.prototype.start = function() {
    var self = this;
    log("starting");

    // Listen for hub events.
    return ProjectionQueue.prototype.start.call(this, "AccessToken");
  };

  AccessTokenProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;
    var lookup = {id: data.id};

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new AccessTokenModel();
        persist.id = data.id;
        persist.userId = data.userId;
        persist.owner = data.owner;
        persist.scope = data.scope;
        persist.resources = data.resources;
        persist.issued = new Date(data.issued);
        persist.expires = new Date(data.expires);
        promise = persist.saveAsync().catch(persistError);
        break;
      case "deleted":
        promise = AccessTokenModel.findOneAsync({ id: data.id })
          .then(function(persist) { return persist.removeAsync().return(persist); })
          .catch(persistError);
        break;
      default:
        promise = Promise.reject(new Error(util.format("unrecognised accessToken event: %s",data.__event)));
        break;
    }

    return promise;
  };

  return AccessTokenProjection;
}());