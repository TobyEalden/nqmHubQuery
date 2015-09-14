/**
 * Created by toby on 21/08/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:APITokenProjection");
  var errLog = require("debug")("nqmQueryHub:APITokenProjection:error");
  var Promise = require("bluebird");
  var ProjectionQueue = require("./projectionQueue");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var APITokenModel = require("../models/apiTokenModel");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  function APITokenProjection() {
    log("constructor");
    ProjectionQueue.call(this);
  }
  util.inherits(APITokenProjection, ProjectionQueue);

  APITokenProjection.prototype.start = function() {
    log("starting");

    // Listen for hub events.
    return ProjectionQueue.prototype.start.call(this, "ApiToken");
  };

  APITokenProjection.prototype.onEvent = function(data) {
    var promise;

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new APITokenModel();
        persist.id = data.jti;
        // Remove all properties beginning with _ (version, timestamp etc).
        persist.token = _.omit(data,function(v,k) {
          return k.indexOf('_') === 0;
        });
        promise = persist.saveAsync().catch(persistError);
        break;
      case "touched":
        promise = APITokenModel.findOneAsync({ id: data.id })
          .then(function(persist) { persist.touch = data.touch; return persist; })
          .then(function(persist) { return persist.saveAsync().return(persist); })
          .catch(persistError);      
        break;
      case "deleted":
        promise = APITokenModel.findOneAsync({ id: data.id })
          .then(function(persist) { return persist.removeAsync().return(persist); })
          .catch(persistError);
        break;
      default:
        promise = Promise.reject(new Error(util.format("unrecognised apiToken event: %s",data.__event)));
        break;
    }

    return promise;
  };

  return APITokenProjection;
}());