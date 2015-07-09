/**
 * Created by toby on 28/06/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:DatasetDataProjection");
  var errLog = require("debug")("nqmQueryHub:error");
  var Promise = require("bluebird");
  var jsonPointer = require("json-pointer");
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
    var keys = {};
    _.forEach(fieldPaths, function(f) {
      var key = f.asc || f.desc;
      var lookup = "/" + key.replace(/\./gi, "/");
      var keyVal = jsonPointer.get(params, lookup);
      if (keyVal === undefined) {
        errLog("undefined key for field %s", key);
      }
      keys[key] = keyVal;
    });
    return keys;
  };

  var dataUpdate = function(dataIn) {
    var data = _.cloneDeep(dataIn);
    delete data._id;
    var key = getDataKey(this._dataset.uniqueIndex, data);
    return this._DataModel.findOneAndUpdateAsync(key, data).catch(persistError);
  };

  var markPointerModified = function(doc, pointer) {
    var path = pointer.substr(1).replace(/\//gi,'.');
    doc.markModified(path);
  };

  var setPointer = function(doc, pointer, value) {
    var path = pointer.substr(1).replace(/\//gi,'.');
    doc.set(path, value);
  };

  var applyUpdate = function(update) {
    var tmp;
    switch (update.method) {
      case "add":
        //jsonPointer.set(this, update.pointer, update.value);
        setPointer(this,update.pointer, update.value);
        break;
      case "replace":
        //jsonPointer.set(this, update.pointer, update.value);
        setPointer(this,update.pointer, update.value);
        break;
      case "remove":
        jsonPointer.remove(this, update.pointer);
        markPointerModified(this,update.pointer);
        break;
      case "move":
        tmp = jsonPointer.get(this, update.pointer);
        jsonPointer.remove(this, update.pointer);
        markPointerModified(this,update.pointer);
        //jsonPointer.set(this, update.value, tmp);
        setPointer(this,update.value, tmp);
        break;
      case "copy":
        tmp = jsonPointer.get(this, update.pointer);
        //jsonPointer.set(this, update.value, tmp);
        setPointer(this,update.value, tmp);
        break;
      default:
        errLog("unrecognised update method '%s'", update.method);
        break;
    }
  };

  var dataUpsert = function(dataIn) {
    var self = this;
    var data = _.cloneDeep(dataIn);
    delete data._id;
    var key = getDataKey(this._dataset.uniqueIndex, data);
    return this._DataModel.findOne(key).then(function(doc) {
      _.forEach(data.update, function(update) {
        applyUpdate.call(doc, update);
      },self);

      return doc.save();
      //return self._DataModel.updateAsync(key, doc);
    }).catch(persistError);
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
      case "upsert":
        promise = dataUpsert.call(this, data);
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