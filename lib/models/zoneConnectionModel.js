/**
 * Created by toby on 10/09/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "ZoneConnection"
  };

  var zoneConnectionSchema = new mongoose.Schema({
    id: String,
    owner: String,
    ownerEmail: String,
    ownerServer: String,
    other: String,
    otherEmail: String,
    otherServer: String,
    status: String,
    issued: Date,
    expires: Date
  }, schemaOptions);

  zoneConnectionSchema.index({ id: 1 }, {unique: true });

  var ZoneConnectionModel = mongoose.model("ZoneConnection", zoneConnectionSchema);
  Promise.promisifyAll(ZoneConnectionModel);

  return ZoneConnectionModel;
}());

