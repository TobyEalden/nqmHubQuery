/**
 * Created by toby on 28/06/15.
 */
"use strict";

exports.Projection = (function() {
  var log = require("debug")("IOTFeedProjection");
  var Promise = require("bluebird");
  var IOTFeedModel = require("../models/iotFeedModel");
  var ProjectionQueue = require("./projectionQueue");
  var DatasetDataProjection = require("./datasetDataProjection").Projection;
  var _ = require("lodash");
  var util = require("util");

  var persistError = function(err) {
    log("failed to save model: %s", err.message);
  };

  function IOTFeedProjection() {
    log("constructor");
    ProjectionQueue.call(this);
    this._dataProjectionCache = {};
  }
  util.inherits(IOTFeedProjection, ProjectionQueue);

  var startDataProjection = function(feed) {
    if (feed.scheme && feed.scheme.fields && feed.scheme.fields.length > 0) {
      if (this._dataProjectionCache.hasOwnProperty(feed.store)) {
        // Already have a projection running for this dataset.
        // Restart it?
        log("****** stopping data projection %s", feed.store);
        this._dataProjectionCache[feed.store].stop();
      }
      log("starting data projection %s", feed.store);
      this._dataProjectionCache[feed.store] = new DatasetDataProjection();
      return this._dataProjectionCache[feed.store].start(feed);
    } else {
      // No schema set - todo - enforce a schema?
      return Promise.resolve();
    }
  };

  IOTFeedProjection.prototype.startDataProjections = function() {
    var self = this;
    return IOTFeedModel.findAsync({})
      .then(function(feeds) {
        log("got feeds %j",feeds);
        var promises = [];
        _.forEach(feeds, function(feed) {
          promises.push(startDataProjection.call(self, feed));
        });
        return Promise.all(promises);
      });
  };

  IOTFeedProjection.prototype.start = function() {
    var self = this;
    log("starting");
    // Listen for feed events.
    return ProjectionQueue.prototype.start.call(this, "IOTFeed")
      .then(function() { return self.startDataProjections(); });
  };

  IOTFeedProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new IOTFeedModel();
        persist.id = data.id;
        persist.hubId = data.hubId;
        persist.name = data.name;
        persist.scheme = data.schema;
        persist.store = data.store;
        persist.version = data.__version;
        promise = persist.saveAsync()
          .then(function() { startDataProjection.call(self, persist); })
          .catch(persistError);
        break;
      case "renamed":
        promise = IOTFeedModel.findOneAsync({id: data.id})
          .then(function(persist) { persist.name = data.name; persist.version = data.__version; return persist.saveAsync(); })
          .catch(persistError);
        break;
      case "schemaSet":
        promise = IOTFeedModel.findOneAsync({id: data.id})
          .then(function(persist) { persist.scheme = data.schema; persist.version = data.__version; return persist.saveAsync().then(function() { return persist; });})
          .then(function(persist) { startDataProjection.call(self, persist); })
          .catch(persistError);
        break;
      default:
        log("unrecognised iotFeed event: %s",data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return IOTFeedProjection;

}());