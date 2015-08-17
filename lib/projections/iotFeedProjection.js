/**
 * Created by toby on 28/06/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:IOTFeedProjection");
  var errLog = require("debug")("nqmQueryHub:error:IOTFeedProjection");
  var Promise = require("bluebird");
  var DatasetProjectionBase = require("./datasetProjectionBase");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var IOTFeedModel = require("../models/iotFeedModel");

  function IOTFeedProjection(hubProjection) {
    log("constructor");
    this._hubProjection = hubProjection;
    DatasetProjectionBase.call(this, IOTFeedModel);
  }
  util.inherits(IOTFeedProjection, DatasetProjectionBase);

  IOTFeedProjection.prototype.getServiceType = function() {
    return "IOTFeed";
  };

  IOTFeedProjection.prototype.startDataProjection = function(feed) {
    if (this.isCatchingUp()) {
      log("ignoring startFeedProjection when catching up");
      return Promise.resolve(feed);
    } else {
      return this._hubProjection.startDataProjection(feed);
    }
  };

  IOTFeedProjection.prototype.stopDataProjection = function(feed) {
    if (this.isCatchingUp()) {
      log("ignoring stopFeedProjection when catching up");
      return Promise.resolve(feed);
    } else {
      return this._hubProjection.stopDataProjection(feed);
    }
  };

  IOTFeedProjection.prototype.startDataProjections = function() {
    // Nothing to do here as data projections are managed by the hub projection.
    return Promise.resolve();
  };

  IOTFeedProjection.prototype.getDatasetKey = function(data) {
    return { hubId: data.hubId, id: data.id };
  };

  IOTFeedProjection.prototype.onCreateDataset = function(data) {
    log("creating feed dataset with %j",data);
    var dataset = new IOTFeedModel();
    dataset.id = data.id;
    dataset.hubId = data.hubId;
    dataset.owner = data.owner;
    dataset.name = data.name;
    dataset.description = data.description;
    dataset.scheme = data.schema;
    dataset.uniqueIndex = data.uniqueIndex;
    dataset.store = data.store;
    dataset.tags = data.tags || [];
    dataset.dataUrl = util.format("%s/timeseries/%s/%s",config.rootURL,data.hubId,data.id);
    dataset.version = data.__version;
    return dataset;
  };

  return IOTFeedProjection;
}());