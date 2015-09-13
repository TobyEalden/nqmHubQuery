/**
 * Created by toby on 24/06/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:DatasetProjection");
  var errLog = require("debug")("nqmQueryHub:error:DatasetProjection");
  var Promise = require("bluebird");
  var DatasetProjectionBase = require("./datasetProjectionBase");
  var DatasetDataProjection = require("./datasetDataProjection").Projection;
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var DatasetModel = require("../models").DatasetModel;

  function DatasetProjection() {
    log("constructor");
    this._dataProjectionCache = {};
    DatasetProjectionBase.call(this, DatasetModel);
  }
  util.inherits(DatasetProjection, DatasetProjectionBase);

  DatasetProjection.prototype.getServiceType = function() {
    return "dataset";
  };

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
      .then(function(ds) {
        log("starting all data projections for %d datasets: %j",ds.length, _.map(ds, function(d) { return d.name; }));
        var promises = [];
        _.forEach(ds, function(d) {
          promises.push(self.startDataProjection(d));
        });
        return Promise.all(promises);
      });
  };

  DatasetProjection.prototype.getDatasetKey = function(data) {
    return { id: data.id };
  };

  DatasetProjection.prototype.onCreateDataset = function(data) {
    log("creating dataset with params %j", data);
    var dataset = new DatasetModel();
    dataset.id = data.id;
    dataset.name = data.name;
    dataset.description = data.description;
    dataset.owner = data.owner;
    dataset.scheme = data.schema;
    dataset.uniqueIndex = data.uniqueIndex;
    dataset.store = data.store;
    // TODO - review this - add hook on client side to set the URL?
    dataset.dataUrl = util.format("%s/datasets/%s/data",config.rootURL,data.id);
    dataset.shareMode = data.shareMode;
    dataset.version = data.__version;
    return dataset;
  };

  return DatasetProjection;
}());
