/**
 * Created by toby on 24/06/15.
 */
"use strict";

exports.Projection = (function() {
  var log = require("debug")("DatasetProjection");
  var Promise = require("bluebird");
  var DatasetModel = require("../models").DatasetModel;
  var ProjectionQueue = require("./projectionQueue");
  var DatasetDataProjection = require("./datasetDataProjection").Projection;
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");

  var persistError = function(err) {
    log("failed to save model: %s", err.message);
  };

  function DatasetProjection() {
    log("constructor");
    ProjectionQueue.call(this);
    this._dataProjectionCache = {};
  }
  util.inherits(DatasetProjection, ProjectionQueue);

  DatasetProjection.prototype.start = function() {
    var self = this;
    log("starting");
    // Listen for dataset events.
    return ProjectionQueue.prototype.start.call(this, "Dataset")
      .then(function() { return self.startDataProjections(); });
  };

  var startDataProjection = function(dataset) {
    if (this.isCatchingUp()) {
      // Ignore data projection start requests if catching up - they are all
      // started when catchup is complete.
      log("ignoring startDataProjection request while catching up");
    } else {
      if (dataset.scheme && dataset.scheme.fields && dataset.scheme.fields.length > 0) {
        if (this._dataProjectionCache.hasOwnProperty(dataset.store)) {
          // Already have a projection running for this dataset.
          // Restart it?
          log("****** stopping data projection %s", dataset.store);
          this._dataProjectionCache[dataset.store].stop();
        }
        log("starting data projection %s", dataset.store);
        this._dataProjectionCache[dataset.store] = new DatasetDataProjection();
        return this._dataProjectionCache[dataset.store].start(dataset);
      } else {
        // No schema set - todo - enforce a schema?
        log("no schema - projection not started for data %s",dataset.id);
        return Promise.resolve();
      }
    }
  };

  var stopDataProjection = function(dataset) {
    if (this._dataProjectionCache.hasOwnProperty(dataset.store)) {
      log("stopping data projection %s", dataset.store);
      this._dataProjectionCache[dataset.store].stop();
      delete this._dataProjectionCache[dataset.store];
    }
  };

  DatasetProjection.prototype.startDataProjections = function() {
    var self = this;
    log("loading datasets");
    return DatasetModel.findAsync({})
      .then(function(ds) {
        log("starting all data projections for all %d datasets: %j",ds.length, ds);
        var promises = [];
        _.forEach(ds, function(d) {
          promises.push(startDataProjection.call(self, d));
        });
        return Promise.all(promises);
      });
  };

  DatasetProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new DatasetModel();
        persist.id = data.id;
        persist.name = data.name;
        persist.scheme = data.schema;
        persist.store = data.store;
        persist.dataUrl = util.format("%s/datasets/%s/data",config.rootURL,data.id);
        persist.version = data.__version;
        promise = persist.saveAsync()
          .then(function() { startDataProjection.call(self, persist); })
          .catch(persistError);
        break;
      case "renamed":
        promise = DatasetModel.findOneAsync({id: data.id})
          .then(function(persist) { persist.name = data.name; persist.version = data.__version; return persist.saveAsync(); })
          .catch(persistError);
        break;
      case "schemaSet":
        promise = DatasetModel.findOneAsync({id: data.id})
          .then(function(persist) { persist.scheme = data.schema; persist.version = data.__version; return persist.saveAsync().return(persist); })
          .then(function(persist) { startDataProjection.call(self, persist); })
          .catch(persistError);
        break;
      case "deleted":
        promise = DatasetModel.findOneAsync({id: data.id})
          .then(function(persist) { stopDataProjection.call(self, persist); return persist; })
          .then(function(persist) { return persist.removeAsync().return(persist); })
          .then(function(persist) {
            var mongoose = require("mongoose");
            log("dataset deleted => dropping dataset data collection %s",persist.store);
            return mongoose.connection.db.dropCollection(persist.store, function(err) {
              if (err) {
                // This usually means the collection doesn't exist, so we can
                // ignore it.
                log("failed to drop collection %s - [%s]", persist.store, err.message);
              }
              return Promise.resolve();
            });
          })
          .catch(persistError);
        break;
      default:
        log("unrecognised dataset event: %s",data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return DatasetProjection;
}());
