/**
 * Created by toby on 14/08/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:ZoneConnectionProjection");
  var errLog = require("debug")("nqmQueryHub:error:ZoneConnectionProjection");
  var Promise = require("bluebird");
  var ProjectionQueue = require("./projectionQueue");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var ZoneConnectionModel = require("../models/zoneConnectionModel");
  var permissions = require("../permissions");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  function ZoneConnectionProjection() {
    log("constructor");
    ProjectionQueue.call(this);
  }
  util.inherits(ZoneConnectionProjection, ProjectionQueue);

  ZoneConnectionProjection.prototype.start = function() {
    var self = this;
    log("starting");

    // Listen for hub events.
    return ProjectionQueue.prototype.start.call(this, "ZoneConnection");
  };

  ZoneConnectionProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;
    var lookup = {id: data.id};

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        // TODO - check if expiry has already happened and update status.
        var persist = new ZoneConnectionModel();
        persist.id = data.id;
        persist.owner = data.owner;
        persist.ownerEmail = data.ownerEmail;
        persist.ownerServer = data.ownerServer;
        persist.otherEmail = data.otherEmail;
        persist.issued = new Date(data.issued);
        persist.expires = new Date(data.expires);
        persist.status = "issued";
        promise = persist.saveAsync().catch(persistError);
        break;
      case "accepted":
        promise = ZoneConnectionModel.findOneAsync({ id: data.id })
          .then(function(persist) {
            persist.other = data.other;
            persist.otherServer = data.otherServer;
            persist.status = "trusted";
            return persist;
          })
          .then(function(persist) { return persist.saveAsync().return(persist); })
          .then(function(persist) {
            return permissions.addTrustedZone(persist).return(persist);
          })
          .catch(persistError);
        break;
      case "deleted":
        // TODO - delete all share tokens that reference this trusted user?
        promise = ZoneConnectionModel.findOneAsync({ id: data.id })
          .then(function(persist) { return persist.removeAsync().return(persist); })
          .then(permissions.removeTrustedZone)
          .catch(persistError);
        break;
      default:
        promise = Promise.reject(new Error(util.format("unrecognised zoneConnection event: %s",data.__event)));
        break;
    }

    return promise;
  };

  return ZoneConnectionProjection;
}());