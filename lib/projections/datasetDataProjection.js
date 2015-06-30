/**
 * Created by toby on 28/06/15.
 */

"use strict";

exports.Projection = (function() {
  var log = require("debug")("DatasetDataProjection");
  var Promise = require("bluebird");
  var _  = require("lodash");
  var dynamicModelFactory = require("../models").DynamicModel.createModel;
  var ProjectionQueue = require("./projectionQueue");
  var util = require("util");

  var persistError = function(err) {
    log("failed to save model: %s", err.message);
  };

  var dataCreate = function(data) {
    var newRow = this._DataModel();
    // ToDo - merge properly
    _.forEach(this._datasetModel.scheme.fields, function(f) {
      newRow[f.name] = data[f.name];
    });
    return newRow.saveAsync()
      .catch(persistError);
  };

  var dataUpdate = function(data) {
    var self = this;
    var key = {};
    _.forEach(this._datasetModel.scheme.fields, function(f) {
      if (f.key === true) {
        key[f.name] = data[f.name];
      }
    });
    return this._DataModel.findOneAsync(key).then(function(updateRow) {
      _.forEach(self._datasetModel.scheme.fields, function(f) {
        if (f.key !== true) {
          updateRow[f.name] = data[f.name];
        }
      });
      return updateRow.saveAsync()
        .catch(persistError);
    });
  };

  var dataDelete = function(data) {
    var key = {};
    _.forEach(this._datasetModel.scheme.fields, function(f) {
      if (f.key === true) {
        key[f.name] = data[f.name];
      }
    });
    return this._DataModel.findOneAsync(key).then(function(updateRow) {
      return updateRow.removeAsync()
        .catch(persistError);
    });
  };

  var processError = function(err) {
    log("****** FAILURE PROCESS EVENT **********: %s", err.message);
    throw err;
  };

  function DatasetDataProjection() {
    log("constructor");
    ProjectionQueue.call(this);
  }
  util.inherits(DatasetDataProjection, ProjectionQueue);

  DatasetDataProjection.prototype.start = Promise.method(function(datasetModel) {
    log("starting");
    this._datasetModel = datasetModel;
    this._DataModel = dynamicModelFactory(this._datasetModel.store, datasetModel.scheme.fields);

    return ProjectionQueue.prototype.start.call(this, this._datasetModel.store);
  });

  DatasetDataProjection.prototype.onEvent = function(data) {
    var promise;
    log("processing '%s' event", data.__event);

    switch (data.__event) {
      case "created":
        promise = dataCreate.call(this, data);
        break;
      case "updated":
        promise = dataUpdate.call(this, data);
        break;
      case "deleted":
        promise = dataDelete.call(this, data);
        break;
      default:
        log("unrecognised dataset data event: %s",data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return DatasetDataProjection;
}());