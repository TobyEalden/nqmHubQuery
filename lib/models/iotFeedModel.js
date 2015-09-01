/**
 * Created by toby on 28/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:iotFeedModel");
  var errLog = require("debug")("nqmQueryHub:error");
  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "IOTFeed"
  };

  var schema = new mongoose.Schema({
    id: String,
    hubId: String,
    owner: String,
    name: String,
    description: String,
    tags: [String],
    store: String,
    dataUrl: String,
    scheme: mongoose.Schema.Types.Mixed,
    uniqueIndex: mongoose.Schema.Types.Mixed,
    version: Number,
    shareMode: String
  }, schemaOptions);

  schema.index({ id: 1, hubId: 1 }, {unique: true });
  schema.index({ name: "text"});
  schema.index({ description: "text"});
  schema.index({ tags: "text "});

  schema.on("index", function(err) {
    if (err) {
      errLog("failed to create feed index: %s", err.message);
    }
  });

  var IOTFeedModel = mongoose.model("IOTFeed", schema);
  Promise.promisifyAll(IOTFeedModel);

  return IOTFeedModel;
}());
