/**
 * Created by toby on 08/08/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "ServiceDirectory"
  };

  var serviceDirectorySchema = new mongoose.Schema({
    owner: String,
    serviceType: String,
    server: String,
    instance: String
  }, schemaOptions);

  var ServiceDirectoryModel = mongoose.model("ServiceDirectory", serviceDirectorySchema);
  Promise.promisifyAll(ServiceDirectoryModel);

  return ServiceDirectoryModel;
}());