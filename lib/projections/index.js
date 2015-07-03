/**
 * Created by toby on 29/06/15.
 */

(function() {
  "use strict";

  exports.DatasetDataProjection = require("./datasetDataProjection").Projection;
  var DatasetProjection = exports.DatasetProjection = require("./datasetProjection").Projection;
  var IOTFeedProjection = exports.IOTFeedProjection = require("./iotFeedProjection").Projection;
  var IOTHubProjection = exports.IOTHubProjection = require("./iotHubProjection").Projection;

  exports.start = function() {
    var datasetProj = new DatasetProjection();
    var iotHubProj = new IOTHubProjection();
    var iotFeedProj = new IOTFeedProjection();

    return iotHubProj.start()
      .then(function() { return iotFeedProj.start(); })
      .then(function() { return datasetProj.start(); });
  };
}());
