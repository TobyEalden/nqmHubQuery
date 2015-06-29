/**
 * Created by toby on 28/06/15.
 */

"use strict";

module.exports = (function() {
  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "IOTHub"
  };

  var iotHubSchema = new mongoose.Schema({
    id: { type: String, index: true },
    name: String,
    owner: String,
    feedsUrl: String,
    version: Number
  }, schemaOptions);

  var IOTHubModel = mongoose.model("IOTHub", iotHubSchema);
  Promise.promisifyAll(IOTHubModel);

  return IOTHubModel;
}());