/**
 * Created by toby on 29/06/15.
 */

(function() {
  "use strict";

  var DatasetProjection = exports.DatasetProjection = require("./datasetProjection").Projection;
  var IOTHubProjection = exports.IOTHubProjection = require("./iotHubProjection").Projection;

  exports.start = function() {
    var datasetProj = new DatasetProjection();
    var iotHubProj = new IOTHubProjection();

    return iotHubProj.start()
      .then(function() { return datasetProj.start(); });
  };

  exports.IOTFeedProjection = require("./iotFeedProjection").Projection;
  exports.DatasetDataProjection = require("./datasetDataProjection").Projection;
}());
