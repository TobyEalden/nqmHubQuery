/**
 * Created by toby on 28/06/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var syncStatusSchema = new mongoose.Schema({
    model: String,
    timestamp: Number
  });

  var SyncStatus = mongoose.model("syncStatus",syncStatusSchema,"sync.status");
  Promise.promisifyAll(SyncStatus);

  return SyncStatus;
}());