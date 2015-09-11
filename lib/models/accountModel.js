/**
 * Created by toby on 04/08/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "Account"
  };

  var accountSchema = new mongoose.Schema({
    id: String,
    email: String,
    authId: String,
    modified: Date,
    resources: mongoose.Schema.Types.Mixed
  }, schemaOptions);

  accountSchema.index({ id: 1 }, {unique: true });

  var AccountModel = mongoose.model("Account", accountSchema);
  Promise.promisifyAll(AccountModel);

  return AccountModel;
}());