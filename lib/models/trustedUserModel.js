/**
 * Created by toby on 13/08/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "TrustedUser"
  };

  var trustedUserSchema = new mongoose.Schema({
    id: String,
    userId: String,
    owner: String,
    serviceProvider: String,
    server: String,
    issued: Date,
    expires: Date,
    status: String,
    remoteStatus: String
  }, schemaOptions);

  trustedUserSchema.index({ id: 1 }, {unique: true });

  var TrustedUserModel = mongoose.model("TrustedUser", trustedUserSchema);
  Promise.promisifyAll(TrustedUserModel);

  return TrustedUserModel;
}());
