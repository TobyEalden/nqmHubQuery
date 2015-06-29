/**
 * Created by toby on 20/06/15.
 */
"use strict";

exports.Projection = (function() {
  var log = require("debug")("iotDataProjection");
  var eventBus = require("../busClient").EventBus;
  var TimeSeriesModel = require("../models/timeSeriesDataModel");

  var feedDataHandler = function(data) {
    log("got event %s with data %j",this.event, data);
    var key = this.event.split(".");
    if (key.length > 2) {
      var persist = new TimeSeriesModel({ hubId: key[0], id: key[1], data: data });
      persist.save(function(err) {
        if (err) {
          log("failure saving feed data: %s", err.message);
        }
      });
    } else {
      log("bad event name %s - expected <hubId>.<feedId>.iotData", this.event);
    }
  };

  function TimeSeriesProjection() {
    log("constructor");
  }

  TimeSeriesProjection.prototype.start = function() {
    log("starting");

    // Listen for feedData events.
    return eventBus.then(function(eventBus) { eventBus.subscribe("*.*.feedData",feedDataHandler) });
  };

  return TimeSeriesProjection;
}());