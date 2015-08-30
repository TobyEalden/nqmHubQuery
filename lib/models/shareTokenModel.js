/**
 * Created by toby on 21/08/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "ShareToken"
  };

  var shareTokenResourceSchema = new mongoose.Schema({
    resource: String,
    actions: [String]
  });

  var shareTokenSchema = new mongoose.Schema({
    id: String,
    userId: String,
    owner: String,
    scope: String,
    resources: [ shareTokenResourceSchema ],
    issued: Date,
    expires: Date
  }, schemaOptions);

  shareTokenSchema.index({ id: 1 }, {unique: true });

  var ShareTokenModel = mongoose.model("ShareToken", shareTokenSchema);
  Promise.promisifyAll(ShareTokenModel);

  return ShareTokenModel;
}());
