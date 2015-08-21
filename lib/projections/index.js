/**
 * Created by toby on 29/06/15.
 */

(function() {
  "use strict";

  var DatasetProjection = exports.DatasetProjection = require("./datasetProjection").Projection;
  var IOTHubProjection = exports.IOTHubProjection = require("./iotHubProjection").Projection;
  var AccountProjection = exports.AccountProjection = require("./accountProjection").Projection;
  var TrustedUserProjection = exports.TrustedUserProjection = require("./trustedUserProjection").Projection;
  var AccessTokenProjection = exports.AccessTokenProjection = require("./accessTokenProjection").Projection;

  exports.start = function() {
    var datasetProj = new DatasetProjection();
    var iotHubProj = new IOTHubProjection();
    var accountProj = new AccountProjection();
    var trustedUserProj = new TrustedUserProjection();
    var accessTokenProj = new AccessTokenProjection();

    return iotHubProj.start()
      .then(function() { return datasetProj.start(); })
      .then(function() { return accountProj.start(); })
      .then(function() { return trustedUserProj.start(); })
      .then(function() { return accessTokenProj.start(); });
  };

  exports.IOTFeedProjection = require("./iotFeedProjection").Projection;
  exports.DatasetDataProjection = require("./datasetDataProjection").Projection;
}());
