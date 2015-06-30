/**
 * Created by toby on 24/06/15.
 */
"use strict";

exports.Projection = (function() {
  var log = require("debug")("nqmQueryHub:DatasetProjection");
  var errLog = require("debug")("nqmQueryHub:error");
  var DatasetModel = require("../models").DatasetModel;
  var DatasetProjectionBase = require("./datasetProjectionBase");
  var config = require("../../config.json");
  var util = require("util");

  function DatasetProjection() {
    log("constructor");
    DatasetProjectionBase.call(this, DatasetModel);
  }
  util.inherits(DatasetProjection, DatasetProjectionBase);

  DatasetProjection.prototype.getDatasetKey = function(data) {
    return { id: data.id };
  };

  DatasetProjection.prototype.onCreateDataset = function(data) {
    log("creating dataset with params %j", data);
    var dataset = new DatasetModel();
    dataset.id = data.id;
    dataset.name = data.name;
    dataset.scheme = data.schema;
    dataset.store = data.store;
    dataset.dataUrl = util.format("%s/datasets/%s/data",config.rootURL,data.id);
    dataset.version = data.__version;
    return dataset;
  };

  return DatasetProjection;
}());
