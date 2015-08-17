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

  var schema = new mongoose.Schema({
    id: String,
    name: String,
    owner: String,
    description: String,
    tags: [String],
    store: String,
    dataUrl: String,
    scheme: mongoose.Schema.Types.Mixed,
    uniqueIndex: mongoose.Schema.Types.Mixed,
    version: Number
  }, schemaOptions);

  schema.index({ id: 1 }, { unique: true });
  schema.index({ name: "text" });
  schema.index({ owner: "text" });
  schema.index({ description: "text"});
  schema.index({ tags: "text "});

  schema.on("index", function(err) {
    if (err) {
      errLog("failed to create dataset index: %s", err.message);
    }
  });

  var DatasetModel = mongoose.model("Dataset", schema);
  Promise.promisifyAll(DatasetModel);

  return DatasetModel;
}());