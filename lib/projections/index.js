/**
 * Created by toby on 29/06/15.
 */

"use strict";

exports.DatasetDataProjection = require("./datasetDataProjection").Projection;
exports.DatasetProjection = require("./datasetProjection").Projection;
exports.IOTFeedProjection = require("./iotFeedProjection").Projection;
exports.IOTHubProjection = require("./iotHubProjection").Projection;

exports.start = (function() {
  var timeSeriesProj = new TimeSeriesProjection();
  var datasetProj = new DatasetProjection();
  var iotHubProj = new IOTHubProjection();
  var iotFeedProj = new IOTFeedProjection();


}());