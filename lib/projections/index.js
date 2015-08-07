/**
 * Created by toby on 29/06/15.
 */

(function() {
  "use strict";

  var DatasetProjection = exports.DatasetProjection = require("./datasetProjection").Projection;
  var IOTHubProjection = exports.IOTHubProjection = require("./iotHubProjection").Projection;
  var AccountProjection = exports.AccountProjection = require("./accountProjection").Projection;

  exports.start = function() {
    var datasetProj = new DatasetProjection();
    var iotHubProj = new IOTHubProjection();
    var accountProj = new AccountProjection();

    return iotHubProj.start()
      .then(function() { return datasetProj.start(); })
      .then(function() { return accountProj.start(); });
  };

  exports.IOTFeedProjection = require("./iotFeedProjection").Projection;
  exports.DatasetDataProjection = require("./datasetDataProjection").Projection;
}());
