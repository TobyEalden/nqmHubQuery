/**
 * Created by toby on 28/06/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:IOTFeedProjection");
  var errLog = require("debug")("nqmQueryHub:error:IOTFeedProjection");
  var Promise = require("bluebird");
  var mongoose = require("mongoose");
  var IOTFeedModel = require("../models/iotFeedModel");
  var ProjectionQueue = require("./projectionQueue");
  var config = require("../../config.json");
  var util = require("util");

  function IOTFeedProjection(hubProjection) {
    log("constructor");
    this._hubProjection = hubProjection;
    ProjectionQueue.call(this);
  }
  util.inherits(IOTFeedProjection, ProjectionQueue);

  IOTFeedProjection.prototype.getDatasetKey = function(data) {
    return { hubId: data.hubId, id: data.id };
  };

  IOTFeedProjection.prototype.onCreateDataset = function(data) {
    log("creating feed dataset with %j",data);
    var dataset = new IOTFeedModel();
    dataset.id = data.id;
    dataset.hubId = data.hubId;
    dataset.name = data.name;
    dataset.description = data.description;
    dataset.scheme = data.schema;
    dataset.uniqueIndex = data.uniqueIndex;
    dataset.store = data.store;
    dataset.tags = data.tags || [];
    dataset.dataUrl = util.format("%s/timeseries/%s/%s",config.rootURL,data.hubId,data.id);
    dataset.version = data.__version;
    return dataset;
  };

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  IOTFeedProjection.prototype.start = function() {
    log("starting");
    // Listen for dataset events.
    return ProjectionQueue.prototype.start.call(this, IOTFeedModel.modelName);
  };

  var dropCollection = Promise.method(function(dataset) {
    log("dataset deleted => dropping %s collection %s",IOTFeedModel.modelName, dataset.store);
    return new Promise(function(resolve) {
      mongoose.connection.db.dropCollection(dataset.store, function(err) {
        if (err) {
          // This usually means the collection doesn't exist, so we can ignore it.
          log("failed to drop collection %s - [%s]", dataset.store, err.message);
          // Fall through and resolve.
        }
        resolve();
      });
    });
  });

  var singlePropertyChange = function(lookup, data, targetProperty, sourceProperty) {
    sourceProperty = sourceProperty || targetProperty;
    return IOTFeedModel.findOneAsync(lookup)
      .then(function(persist) { persist[targetProperty] = data[sourceProperty]; persist.version = data.__version; return persist; })
      .then(function(persist) { return persist.saveAsync().return(persist); })
      .catch(persistError);
  };

  var startFeedProjection = function(feed) {
    if (this.isCatchingUp()) {
      log("ignoring startFeedProjection when catching up");
      return Promise.resolve(feed);
    } else {
      return this._hubProjection.startDataProjection(feed);
    }
  };

  var stopFeedProjection = function(feed) {
    if (this.isCatchingUp()) {
      log("ignoring stopFeedProjection when catching up");
      return Promise.resolve(feed);
    } else {
      return this._hubProjection.stopDataProjection(feed);
    }
  };

  IOTFeedProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;

    log("got event %s with data %j",data.__event, data);
    var lookup = self.getDatasetKey(data);

    switch (data.__event) {
      case "created":
        var persist = self.onCreateDataset(data);
        promise = persist.saveAsync()
          .then(function() { return startFeedProjection.call(self, persist); })
          .catch(persistError);
        break;
      case "descriptionChanged":
        promise = singlePropertyChange.call(self, lookup, data, "description");
        break;
      case "renamed":
        promise = singlePropertyChange.call(self, lookup, data, "name");
        break;
      case "tagsChanged":
        promise = singlePropertyChange.call(self, lookup, data, "tags");
        break;
      case "schemaSet":
        promise = IOTFeedModel.findOneAsync(lookup)
          .then(function(persist) { if (persist) { persist.scheme = data.schema; persist.uniqueIndex = data.uniqueIndex; persist.version = data.__version; } return persist; })
          .then(function(persist) { return persist ? persist.saveAsync().return(persist) : persist; })
          .then(function(persist) { return persist ? startFeedProjection.call(self, persist) : persist; })
          .catch(persistError);
        break;
      case "deleted":
        promise = IOTFeedModel.findOneAsync(lookup)
          .then(function(persist) { return persist ? stopFeedProjection.call(self, persist).return(persist) : persist; })
          .then(function(persist) { return persist ? persist.removeAsync().return(persist) : persist; })
          .then(function(persist) { return persist ? dropCollection.call(self, persist) : persist; })
          .catch(persistError);
        break;
      default:
        errLog("unrecognised %s event: %s", IOTFeedModel.modelName, data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return IOTFeedProjection;
}());