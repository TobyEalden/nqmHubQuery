/**
 * Created by toby on 28/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:datasetModel");
  var errLog = require("debug")("nqmQueryHub:error");
  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "Dataset"
  };

  var datasetSchema = new mongoose.Schema({
    id: String,
    name: String,
    description: String,
    tags: [String],
    store: String,
    dataUrl: String,
    scheme: mongoose.Schema.Types.Mixed,
    uniqueIndex: mongoose.Schema.Types.Mixed,
    version: Number
  }, schemaOptions);

  datasetSchema.index({ id: 1 }, { unique: true });
  datasetSchema.index({ name: "text"});
  datasetSchema.index({ description: "text"});
  datasetSchema.index({ tags: "text "});

  datasetSchema.on("index", function(err) {
    if (err) {
      errLog("failed to create dataset index: %s", err.message);
    }
  });

  var DatasetModel = mongoose.model("Dataset", datasetSchema);
  Promise.promisifyAll(DatasetModel);

  return DatasetModel;
}());