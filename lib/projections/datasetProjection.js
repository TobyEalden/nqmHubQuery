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
  var _ = require("lodash");
  var util = require("util");
  var config = require("../../config.json");

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
    if (dataset.scheme && dataset.scheme.fields.length > 0) {
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
      return Promise.resolve();
    }
  };

  DatasetProjection.prototype.startDataProjections = function() {
    var self = this;
    return DatasetModel.findAsync({})
      .then(function(ds) {
        log("got datasets %j",ds);
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
          .then(function(persist) { persist.scheme = data.schema; persist.version = data.__version; return persist.saveAsync().then(function() { return persist; });})
          .then(function(persist) { startDataProjection.call(self, persist); })
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
