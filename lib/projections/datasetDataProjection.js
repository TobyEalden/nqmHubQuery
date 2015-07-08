/**
 * Created by toby on 28/06/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:DatasetDataProjection");
  var errLog = require("debug")("nqmQueryHub:error");
  var Promise = require("bluebird");
  var JSONPath = require("JSONPath");
  var _  = require("lodash");
  var dynamicModelFactory = require("../models").DynamicModel.createModel;
  var ProjectionQueue = require("./projectionQueue");
  var util = require("util");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  var dataCreate = function(data) {
    var cpy = _.cloneDeep(data);
    delete cpy._id;
    var newRow = new this._DataModel(cpy);
    return newRow.saveAsync().catch(persistError);
  };

  /*
   * Get dictionary of values corresponding to the given array of field names,
   * where field names can be in path form, e.g. address.postcode.
   */
  var getDataKey = function(fieldPaths, params) {
    var key = {};
    _.forEach(fieldPaths, function(v, k) {
      var keyVal = JSONPath.eval(params, k);
      if (keyVal.length > 0) {
        key[k] = keyVal[0];
      }
    });
    return key;
  };

  var dataUpdate = function(dataIn) {
    var data = _.cloneDeep(dataIn);
    delete data._id;
    var key = getDataKey(this._dataset.uniqueIndex, data);
    return this._DataModel.findOneAndUpdateAsync(key, data).catch(persistError);
  };

  var dataDelete = function(dataIn) {
    var data = _.cloneDeep(dataIn);
    delete data._id;
    var key = getDataKey(this._dataset.uniqueIndex, data);
    return this._DataModel.findOneAndRemoveAsync(key).catch(persistError);
  };

  function DatasetDataProjection() {
    log("constructor");
    ProjectionQueue.call(this);
  }
  util.inherits(DatasetDataProjection, ProjectionQueue);

  DatasetDataProjection.prototype.start = Promise.method(function(dataset) {
    log("starting");
    this._dataset = dataset;
    this._DataModel = dynamicModelFactory(this._dataset.store, dataset.scheme, dataset.uniqueIndex);

    return ProjectionQueue.prototype.start.call(this, this._dataset.store);
  });

  DatasetDataProjection.prototype.getDataset = function() {
    return this._dataset;
  };

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
        errLog("unrecognised dataset data event: %s",data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return DatasetDataProjection;
}());