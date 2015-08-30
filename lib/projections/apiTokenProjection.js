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
    ProjectionQueue.call(this, APITokenModel);
  }
  util.inherits(APITokenProjection, ProjectionQueue);

  APITokenProjection.prototype.start = function() {
    var self = this;
    log("starting");

    // Listen for hub events.
    return ProjectionQueue.prototype.start.call(this, "ApiToken");
  };

  APITokenProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;
    var lookup = {id: data.id};

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new APITokenModel();
        persist.id = data.id;
        persist.userId = data.userId;
        persist.issued = new Date(data.issued);
        persist.expires = new Date(data.expires);
        promise = persist.saveAsync().catch(persistError);
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