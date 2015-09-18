/**
 * Created by toby on 20/06/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQuery:IOTHubProjection");
  var errLog = require("debug")("nqmQuery:IOTHubProjection:error");
  var Promise = require("bluebird");
  var IOTHubModel = require("../models/iotHubModel");
  var ProjectionQueue = require("./projectionQueue");
  var util = require("util");
  var config = require("../../config.json");
  var _ = require("lodash");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
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

  var singlePropertyChange = function(lookup, data, targetProperty, sourceProperty) {
    sourceProperty = sourceProperty || targetProperty;
    return IOTHubModel.findOneAsync(lookup)
      .then(function(persist) { persist[targetProperty] = data[sourceProperty]; persist.version = data.__version; return persist; })
      .then(function(persist) { return persist.saveAsync().return(persist); })
      .catch(persistError);
  };

  IOTHubProjection.prototype.onEvent = function(data) {
    var promise;
    var lookup = {id: data.id};

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new IOTHubModel();
        persist.id = data.id;
        persist.name = data.name;
        persist.description = data.description;
        persist.tags = data.tags || [];
        persist.owner = data.owner;
        persist.version = data.__version;
        promise = persist.saveAsync().catch(persistError);
        break;
      case "renamed":
        promise = singlePropertyChange(lookup, data, "name");
        break;
      case "descriptionChanged":
        promise = singlePropertyChange(lookup, data, "description");
        break;
      case "tagsChanged":
        promise = singlePropertyChange(lookup, data, "tags");
        break;
      case "deleted":
        promise = IOTHubModel.findOneAsync({id: data.id})
          .then(function(persist) { return persist.removeAsync().return(persist); })
          .catch(persistError);
        break;
      default:
        promise = Promise.reject(new Error(util.format("unrecognised iotHub event: %s",data.__event)));
        break;
    }

    return promise;
  };

  return IOTHubProjection;

}());