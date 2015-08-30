/**
 * Created by toby on 21/08/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "ApiToken"
  };

  var apiTokenSchema = new mongoose.Schema({
    id: String,
    userId: String,
    issued: Date,
    expires: Date
  }, schemaOptions);

  apiTokenSchema.index({ id: 1 }, {unique: true });

  var APITokenModel = mongoose.model("ApiToken", apiTokenSchema);
  Promise.promisifyAll(APITokenModel);

  return APITokenModel;
}());
