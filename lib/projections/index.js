/**
 * Created by toby on 29/06/15.
 */

(function() {
  "use strict";

  var DatasetProjection = exports.DatasetProjection = require("./datasetProjection").Projection;
  var IOTHubProjection = exports.IOTHubProjection = require("./iotHubProjection").Projection;
  var AccountProjection = exports.AccountProjection = require("./accountProjection").Projection;
  var ShareTokenProjection = exports.ShareTokenProjection = require("./shareTokenProjection").Projection;
  var ApiTokenProjection = exports.ApiTokenProjection = require("./apiTokenProjection").Projection;
  var ZoneConnectionProjection = exports.ZoneConnectionProjection = require("./zoneConnectionProjection").Projection;
  var VisualisationProjection = exports.VisualisationProjection = require("./visualisationProjection").Projection;
  var WidgetProjection = exports.WidgetProjection = require("./widgetProjection").Projection;

  exports.start = function() {
    var datasetProj = new DatasetProjection();
    var iotHubProj = new IOTHubProjection();
    var accountProj = new AccountProjection();
    var shareTokenProj = new ShareTokenProjection();
    var apiTokenProj = new ApiTokenProjection();
    var zoneConnectionProj = new ZoneConnectionProjection();
    var visualisationProj = new VisualisationProjection();
    var widgetProj = new WidgetProjection();

    return accountProj.start()
      .then(function() { return iotHubProj.start(); })
      .then(function() { return datasetProj.start(); })
      .then(function() { return visualisationProj.start(); })
      .then(function() { return widgetProj.start(); })
      .then(function() { return zoneConnectionProj.start(); })
      .then(function() { return shareTokenProj.start(); })
      .then(function() { return apiTokenProj.start(); });
  };

  exports.DatasetDataProjection = require("./datasetDataProjection").Projection;
}());
