/**
 * Created by toby on 24/06/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:DatasetProjection");
  var errLog = require("debug")("nqmQueryHub:DatasetProjection:error");
  var Promise = require("bluebird");
  var ResourceProjectionBase = require("./resourceProjectionBase");
  var DatasetDataProjection = require("./datasetDataProjection").Projection;
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var DatasetModel = require("../models").DatasetModel;

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    return Promise.reject(err);
  };

  function DatasetProjection() {
    log("constructor");
    this._dataProjectionCache = {};
    ResourceProjectionBase.call(this, DatasetModel);
  }
  util.inherits(DatasetProjection, ResourceProjectionBase);

  DatasetProjection.prototype.start = function() {
    var self = this;
    log("starting");
    // Listen for dataset events.
    return ResourceProjectionBase.prototype.start.call(this, self._ModelClass.modelName)
      .then(function() { return self.startDataProjections(); });
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

  DatasetProjection.prototype.startDataProjection = function(dataset) {
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
            throw err;
          });
      } else {
        // No schema set - todo - enforce a schema?
        log("no schema - projection not started for data %s",dataset.id);
        return Promise.resolve();
      }
    }
  };

  DatasetProjection.prototype.stopDataProjection = Promise.method(function(dataset) {
    if (this._dataProjectionCache.hasOwnProperty(dataset.store)) {
      log("stopping data projection %s", dataset.store);
      this._dataProjectionCache[dataset.store].stop();
      delete this._dataProjectionCache[dataset.store];
    }
  });

  DatasetProjection.prototype.startDataProjections = function() {
    var self = this;
    log("loading %ss",DatasetModel.modelName);
    return DatasetModel.findAsync({})
      .then(function(datasets) {
        // Use reduce to start each projection sequentially.
        // This isn't strictly necessary as there should be no dependencies
        // between datasets.
        return Promise.reduce(datasets, function(acc, d) {
          log("starting data projection for dataset %s", d.name);
          return self.startDataProjection(d);
        }, 0);
      });
  };

  DatasetProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;
    var lookup = { id: data.id };

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = this.create(data);
        // TODO - review this - add hook on client side to set the URL?
        persist.dataUrl = util.format("%s/datasets/%s/data",config.rootURL,data.id);
        persist.scheme = data.schema;
        persist.uniqueIndex = data.uniqueIndex;
        persist.store = data.store;
        promise = this.created(persist).then(function() { return self.startDataProjection(persist); }).catch(persistError);
        break;
      case "descriptionChanged":
        promise = this.descriptionChanged(lookup, data).catch(persistError);
        break;
      case "renamed":
        promise = this.renamed(lookup, data).catch(persistError);
        break;
      case "shareModeSet":
        promise = this.shareModeSet(lookup, data).catch(persistError);
        break;
      case "tagsChanged":
        promise = this.tagsChanged(lookup, data).catch(persistError);
        break;
      case "schemaSet":
        promise = self._ModelClass.findOneAsync(lookup)
          .then(function(persist) {
            if (persist) {
              persist.scheme = data.schema || persist.scheme;
              persist.uniqueIndex = data.uniqueIndex || persist.uniqueIndex;
              persist.modified = new Date(data.__timestamp);
              persist.version = data.__version;
            }
            return persist;
          })
          .then(function(persist) { return persist ? persist.saveAsync().return(persist) : persist; })
          .then(function(persist) { return persist ? self.startDataProjection(persist) : persist; })
          .catch(persistError);
        break;
      case "deleted":
        promise = self._ModelClass.findOneAsync(lookup)
          .then(function(persist) { return persist ? self.stopDataProjection(persist).return(persist) : persist; })
          .then(function(persist) { return persist ? self.deleted(persist) : persist; })
          .then(function(persist) { return persist ? dropCollection.call(self, persist) : persist; })
          .catch(persistError);
        break;
      default:
        errLog("unrecognised %s event: %s", self._ModelClass.modelName, data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return DatasetProjection;
}());
