/**
 * Created by toby on 20/06/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:IOTHubProjection");
  var errLog = require("debug")("nqmQueryHub:error:IOTHubProjection");
  var Promise = require("bluebird");
  var IOTHubModel = require("../models/iotHubModel");
  var IOTFeedModel = require("../models/iotFeedModel");
  var ProjectionQueue = require("./projectionQueue");
  var IOTFeedProjection = require("./iotFeedProjection").Projection;
  var DatasetDataProjection = require("./datasetDataProjection").Projection;
  var util = require("util");
  var config = require("../../config.json");
  var _ = require("lodash");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  function IOTHubProjection() {
    log("constructor");
    this._dataProjectionCache = {};
    ProjectionQueue.call(this);
  }
  util.inherits(IOTHubProjection, ProjectionQueue);

  IOTHubProjection.prototype.start = function() {
    var self = this;
    log("starting");

    this._iotFeedProj = new IOTFeedProjection(self);

    // Listen for hub events.
    return ProjectionQueue.prototype.start.call(this, "IOTHub")
      .then(function() { return self._iotFeedProj.start(); })
      .then(function() { return startHubProjections.call(self); });
  };

  IOTHubProjection.prototype.startDataProjection = function(dataset) {
    if (this.isCatchingUp()) {
      // Ignore data projection start requests if catching up - they are all
      // started when catchup is complete.
      log("ignoring startDataProjection request while catching up");
    } else {
      if (dataset.scheme) {
        if (this._dataProjectionCache.hasOwnProperty(dataset.store)) {
          // Already have a projection running for this dataset.
          // Restart it?
          log("****** stopping data projection %s", dataset.store);
          this._dataProjectionCache[dataset.store].stop();
        }
        log("starting data projection %s", dataset.store);
        this._dataProjectionCache[dataset.store] = new DatasetDataProjection();
        return this._dataProjectionCache[dataset.store].start(dataset)
          .catch(function(err) {
            errLog("failure loading data for %s [%s]",dataset.store, err.message);
          });
      } else {
        // No schema set - todo - enforce a schema?
        log("no schema - projection not started for data %s",dataset.id);
        return Promise.resolve();
      }
    }
  };

  IOTHubProjection.prototype.stopDataProjection = Promise.method(function(dataset) {
    if (this._dataProjectionCache.hasOwnProperty(dataset.store)) {
      log("stopping data projection %s", dataset.store);
      this._dataProjectionCache[dataset.store].stop();
      delete this._dataProjectionCache[dataset.store];
    }
  });

  var startFeedProjections = function(hub) {
    if (this.isCatchingUp()) {
      log("ignoring startFeedProjections when catching up");
    } else {
      var self = this;
      // Start data projections for all feeds belonging to the hub.
      return IOTFeedModel.findAsync({ hubId: hub.id })
        .then(function(feeds) {
          log("starting all data projections for %d feeds: %j",feeds.length, _.map(feeds, function(h) { return h.name; }));
          var promises = [];
          _.forEach(feeds, function(f) {
            promises.push(self.startDataProjection(f));
          });
          return Promise.all(promises);
        });
    }
  };

  var stopFeedProjections = function(hub) {
    // Stop all data projections for feeds belonging to the hub.
    _.forEach(this._dataProjectionCache, function(v,k) {
      if (v.getDataset().hubId === hub.id) {
        this.stopDataProjection(v.getDataset());
      }
    }, this);

    return hub;
  };

  var startHubProjections = function() {
    var self = this;
    // Get all hubs and start the data projections for each feed in the hub.
    return IOTHubModel.findAsync({})
      .then(function(hubs) {
        log("starting all feed projections for %d hubs: %j",hubs.length, _.map(hubs, function(h) { return h.name; }));
        var promises = [];
        _.forEach(hubs, function(h) {
          promises.push(startFeedProjections.call(self, h));
        });
        return Promise.all(promises);
      });
  };

  var removeHubFeeds = function(hub) {
    // Remove all feeds belonging to the hub.
    var promises = [];
    return IOTFeedModel.findAsync({ hubId: hub.id })
      .then(function(feeds) {
        _.forEach(feeds, function(f) {
          promises.push(f.removeAsync());
        });
        return Promise.all(promises);
      });
  };

  var singlePropertyChange = function(lookup, data, targetProperty, sourceProperty) {
    sourceProperty = sourceProperty || targetProperty;
    return IOTHubModel.findOneAsync(lookup)
      .then(function(persist) { persist[targetProperty] = data[sourceProperty]; persist.version = data.__version; return persist; })
      .then(function(persist) { return persist.saveAsync().return(persist); })
      .catch(persistError);
  };

  IOTHubProjection.prototype.onEvent = function(data) {
    var self = this;
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
        persist.feedsUrl = util.format("%s/feeds/%s",config.rootURL,data.id);
        promise = persist.saveAsync()
          .then(function() { return startFeedProjections.call(self, persist); })
          .catch(persistError);
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
          .then(function(persist) { return stopFeedProjections.call(self, persist); })
          .then(function(persist) { return removeHubFeeds.call(self, persist).return(persist); })
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