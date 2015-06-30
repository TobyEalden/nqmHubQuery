/**
 * Created by toby on 28/06/15.
 */
"use strict";

exports.Projection = (function() {
  var log = require("debug")("nqmQueryHub:IOTFeedProjection");
  var errLog = require("debug")("nqmQueryHub:error");
  var IOTFeedModel = require("../models/iotFeedModel");
  var DatasetProjectionBase = require("./datasetProjectionBase");
  var config = require("../../config.json");
  var util = require("util");

  function IOTFeedProjection() {
    log("constructor");
    DatasetProjectionBase.call(this, IOTFeedModel);
  }
  util.inherits(IOTFeedProjection, DatasetProjectionBase);

  IOTFeedProjection.prototype.getDatasetKey = function(data) {
    return { hubId: data.hubId, id: data.id };
  };

  IOTFeedProjection.prototype.onCreateDataset = function(data) {
    log("creating feed dataset with %j",data);
    var dataset = new IOTFeedModel();
    dataset.id = data.id;
    dataset.hubId = data.hubId;
    dataset.name = data.name;
    dataset.scheme = data.schema;
    dataset.store = data.store;
    dataset.dataUrl = util.format("%s/timeseries/%s/%s",config.rootURL,data.hubId,data.id);
    dataset.version = data.__version;
    return dataset;
  };

  return IOTFeedProjection;
}());