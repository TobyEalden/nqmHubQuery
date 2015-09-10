/**
 * Created by toby on 29/06/15.
 */

(function() {
  "use strict";

  var DatasetProjection = exports.DatasetProjection = require("./datasetProjection").Projection;
  var IOTHubProjection = exports.IOTHubProjection = require("./iotHubProjection").Projection;
  var AccountProjection = exports.AccountProjection = require("./accountProjection").Projection;
  var TrustedUserProjection = exports.TrustedUserProjection = require("./trustedUserProjection").Projection;
  var ShareTokenProjection = exports.ShareTokenProjection = require("./shareTokenProjection").Projection;
  var ApiTokenProjection = exports.ApiTokenProjection = require("./apiTokenProjection").Projection;
  var ZoneConnectionProjection = exports.ZoneConnectionProjection = require("./zoneConnectionProjection").Projection;

  exports.start = function() {
    var datasetProj = new DatasetProjection();
    var iotHubProj = new IOTHubProjection();
    var accountProj = new AccountProjection();
    var trustedUserProj = new TrustedUserProjection();
    var shareTokenProj = new ShareTokenProjection();
    var apiTokenProj = new ApiTokenProjection();
    var zoneConnectionProj = new ZoneConnectionProjection();

    return accountProj.start()
      .then(function() { return iotHubProj.start(); })
      .then(function() { return datasetProj.start(); })
//      .then(function() { return trustedUserProj.start(); })
      .then(function() { return zoneConnectionProj.start(); })
      .then(function() { return shareTokenProj.start(); })
      .then(function() { return apiTokenProj.start(); });
  };

  exports.IOTFeedProjection = require("./iotFeedProjection").Projection;
  exports.DatasetDataProjection = require("./datasetDataProjection").Projection;
}());
