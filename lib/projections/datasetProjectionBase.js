/**
 * Created by toby on 30/06/15.
 */
"use strict";

module.exports = (function() {
  var log = require("debug")("nqmQueryHub:datasetProjectionBase");
  var errLog = require("debug")("nqmQueryHub:error");
  var Promise = require("bluebird");
  var mongoose = require("mongoose");
  var ProjectionQueue = require("./projectionQueue");
  var DatasetDataProjection = require("./datasetDataProjection").Projection;
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
  };

  function DatasetProjectionBase(Model) {
    log("constructor");
    this._ModelClass = Model;
    this._dataProjectionCache = {};
    ProjectionQueue.call(this);
  }
  util.inherits(DatasetProjectionBase, ProjectionQueue);

  DatasetProjectionBase.prototype.start = function() {
    var self = this;
    log("starting");
    // Listen for dataset events.
    return ProjectionQueue.prototype.start.call(this, self._ModelClass.modelName)
      .then(function() { return self.startDataProjections(); });
  };

  DatasetProjectionBase.prototype.startDataProjection = function(dataset) {
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

  DatasetProjectionBase.prototype.stopDataProjection = Promise.method(function(dataset) {
    if (this._dataProjectionCache.hasOwnProperty(dataset.store)) {
      log("stopping data projection %s", dataset.store);
      this._dataProjectionCache[dataset.store].stop();
      delete this._dataProjectionCache[dataset.store];
    }
  });

  DatasetProjectionBase.prototype.startDataProjections = function() {
    var self = this;
    log("loading %ss",self._ModelClass.modelName);
    return self._ModelClass.findAsync({})
      .then(function(ds) {
        log("starting all data projections for %d datasets: %j",ds.length, ds);
        var promises = [];
        _.forEach(ds, function(d) {
          promises.push(self.startDataProjection(d));
        });
        return Promise.all(promises);
      });
  };

  var dropCollection = Promise.method(function(dataset) {
    log("dataset deleted => dropping %s collection %s",this._ModelClass.modelName, dataset.store);
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
    return this._ModelClass.findOneAsync(lookup)
      .then(function(persist) { persist[targetProperty] = data[sourceProperty]; persist.version = data.__version; return persist; })
      .then(function(persist) { return persist.saveAsync().return(persist); });
  };

  DatasetProjectionBase.prototype.onEvent = function(data) {
    var self = this;
    var promise;

    log("got event %s with data %j",data.__event, data);
    var lookup = self.getDatasetKey(data);

    switch (data.__event) {
      case "created":
        var persist = self.onCreateDataset(data);
        promise = persist.saveAsync().then(function() { return self.startDataProjection(persist); });
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
        promise = singlePropertyChange.call(self, lookup, data, "scheme", "schema").then(function(persist) { return self.startDataProjection(persist); });
        break;
      case "deleted":
        promise = self._ModelClass.findOneAsync(lookup)
          .then(function(persist) { return self.stopDataProjection(persist).return(persist); })
          .then(function(persist) { return persist.removeAsync().return(persist); })
          .then(function(persist) { return dropCollection.call(self, persist); })
          .catch(persistError);
        break;
      default:
        errLog("unrecognised %s event: %s", self._ModelClass.modelName, data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return DatasetProjectionBase;
}());
