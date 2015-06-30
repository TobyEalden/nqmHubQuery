/**
 * Created by toby on 28/06/15.
 */

"use strict";

module.exports = (function() {
  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "Dataset"
  };

  var datasetSchema = new mongoose.Schema({
    id: { type: String, index: true },
    name: String,
    store: String,
    dataUrl: String,
    scheme: {           /* Can't use the property 'schema' here as it confuses mongoose. */
      fields: [{
        name: String,
        description: String,
        storageType: String,  /* Can't use the property 'type' here as it confuses mongooooose. */
        key: Boolean,
        units: String,
        _id: false
      }]
    },
    version: Number
  }, schemaOptions);

  var DatasetModel = mongoose.model("Dataset", datasetSchema);
  Promise.promisifyAll(DatasetModel);

  return DatasetModel;
}());