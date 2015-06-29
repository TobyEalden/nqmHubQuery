/**
 * Created by toby on 28/06/15.
 */

"use strict";

module.exports = (function() {
  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var timeSeriesSchema = new mongoose.Schema({
    hubId: String,
    id: String,
    data: mongoose.Schema.Types.Mixed
  });
  var TimeSeriesModel = mongoose.model("timeSeries.datum",timeSeriesSchema);
  Promise.promisifyAll(TimeSeriesModel);

  return TimeSeriesModel;
}());