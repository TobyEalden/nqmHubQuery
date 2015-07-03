/**
 * Created by toby on 28/06/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "IOTFeed"
  };

  var iotFeedSchema = new mongoose.Schema({
    id: String,
    hubId: String,
    name: String,
    description: String,
    tags: [String],
    store: String,
    dataUrl: String,
    scheme: mongoose.Schema.Types.Mixed,
    uniqueIndex: mongoose.Schema.Types.Mixed,
    version: Number
  }, schemaOptions);

  iotFeedSchema.index({ id: 1, hubId: 1 }, {unique: true });
  iotFeedSchema.index({ name: "text"});
  iotFeedSchema.index({ description: "text"});
  iotFeedSchema.index({ tags: "text "});

  var IOTFeedModel = mongoose.model("IOTFeed", iotFeedSchema);
  Promise.promisifyAll(IOTFeedModel);

  return IOTFeedModel;
}());
