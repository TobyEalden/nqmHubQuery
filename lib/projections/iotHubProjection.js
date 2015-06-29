/**
 * Created by toby on 20/06/15.
 */
"use strict";

exports.Projection = (function() {
  var log = require("debug")("IOTHubProjection");
  var Promise = require("bluebird");
  var IOTHubModel = require("../models/iotHubModel");
  var ProjectionQueue = require("./projectionQueue");
  var util = require("util");

  var persistError = function(err) {
    log("failed to save model: %s", err.message);
  };

  function IOTHubProjection() {
    log("constructor");
    ProjectionQueue.call(this);
  }
  util.inherits(IOTHubProjection, ProjectionQueue);

  IOTHubProjection.prototype.start = function() {
    log("starting");
    // Listen for hub events.
    return ProjectionQueue.prototype.start.call(this, "IOTHub");
  };

  IOTHubProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new IOTHubModel();
        persist.id = data.id;
        persist.name = data.name;
        persist.owner = data.owner;
        persist.version = data.__version;
        promise = persist.saveAsync()
          .catch(persistError);
        break;
      case "renamed":
        promise = IOTHubModel.findOneAsync({id: data.id})
          .then(function(persist) { persist.name = data.name; persist.version = data.__version; return persist.saveAsync(); })
          .catch(persistError);
        break;
      default:
        log("unrecognised iotHub event: %s",data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return IOTHubProjection;

}());