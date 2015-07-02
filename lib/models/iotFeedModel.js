/**
 * Created by toby on 28/06/15.
 */


"use strict";

module.exports = (function() {
  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "IOTFeed"
  };

  var iotFeedSchema = new mongoose.Schema({
    id: { type: String, index: true },
    hubId: { type: String, index: true },
    name: String,
    description: String,
    tags: [String],
    store: String,
    dataUrl: String,
    scheme: {           /* Can't use the property 'schema' here as it confuses mongoose. */
      fields: [{
        name: String,
        storageType: String  /* Can't use the property 'type' here as it confuses mongooooose. */
      }]
    },
    version: Number
  }, schemaOptions);

  var IOTFeedModel = mongoose.model("IOTFeed", iotFeedSchema);
  Promise.promisifyAll(IOTFeedModel);

  return IOTFeedModel;
}());
