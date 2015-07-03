/**
 * Created by toby on 28/06/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "IOTHub"
  };

  var iotHubSchema = new mongoose.Schema({
    id: String,
    name: String,
    owner: String,
    description: String,
    tags: [String],
    feedsUrl: String,
    version: Number
  }, schemaOptions);

  iotHubSchema.index({ id: 1 }, {unique: true });
  iotHubSchema.index({ name: "text"});
  iotHubSchema.index({ owner: "text"});
  iotHubSchema.index({ description: "text"});
  iotHubSchema.index({ tags: "text "});

  var IOTHubModel = mongoose.model("IOTHub", iotHubSchema);
  Promise.promisifyAll(IOTHubModel);

  return IOTHubModel;
}());