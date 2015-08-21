/**
 * Created by toby on 21/08/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "AccessToken"
  };

  var accessTokenResourceSchema = new mongoose.Schema({
    resource: String,
    actions: [String]
  });

  var accessTokenSchema = new mongoose.Schema({
    id: String,
    userId: String,
    owner: String,
    scope: String,
    resources: [ accessTokenResourceSchema ],
    issued: Date,
    expires: Date
  }, schemaOptions);

  accessTokenSchema.index({ id: 1 }, {unique: true });

  var AccessTokenModel = mongoose.model("AccessToken", accessTokenSchema);
  Promise.promisifyAll(AccessTokenModel);

  return AccessTokenModel;
}());
