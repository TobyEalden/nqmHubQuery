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
    authId: String
  }, schemaOptions);

  accountSchema.index({ id: 1 }, {unique: true });

  var AccountModel = mongoose.model("Account", accountSchema);
  Promise.promisifyAll(AccountModel);

  return AccountModel;
}());