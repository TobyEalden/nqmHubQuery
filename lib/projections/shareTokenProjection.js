/**
 * Created by toby on 21/08/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:ShareTokenProjection");
  var errLog = require("debug")("nqmQueryHub:ShareTokenProjection:error");
  var Promise = require("bluebird");
  var ProjectionQueue = require("./projectionQueue");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var ShareTokenModel = require("../models/shareTokenModel");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  function ShareTokenProjection() {
    log("constructor");
    ProjectionQueue.call(this, ShareTokenModel);
  }
  util.inherits(ShareTokenProjection, ProjectionQueue);

  ShareTokenProjection.prototype.start = function() {
    var self = this;
    log("starting");

    // Listen for hub events.
    return ProjectionQueue.prototype.start.call(this, "ShareToken");
  };

  ShareTokenProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;
    var lookup = {id: data.id};

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new ShareTokenModel();
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
        promise = ShareTokenModel.findOneAsync({ id: data.id })
          .then(function(persist) { return persist.removeAsync().return(persist); })
          .catch(persistError);
        break;
      default:
        promise = Promise.reject(new Error(util.format("unrecognised shareToken event: %s",data.__event)));
        break;
    }

    return promise;
  };

  return ShareTokenProjection;
}());