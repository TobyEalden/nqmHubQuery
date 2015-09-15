/**
 * Created by toby on 15/09/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "Resource"
  };

  var resourceSchema = new mongoose.Schema({
    id: String,
    owner: String,
    name: String,
    shareMode: String,
    type: String,
    keywords: [String]
  }, schemaOptions);

  resourceSchema.index({ id: 1 }, {unique: true });

  var ResourceModel = mongoose.model("Resource", resourceSchema);
  Promise.promisifyAll(ResourceModel);

  return ResourceModel;
}());
