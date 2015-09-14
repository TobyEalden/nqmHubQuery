/**
 * Created by toby on 06/09/15.
 */

// TODO - move to background process?

module.exports = (function() {
  var log = require("debug")("nqmQueryHub:houseKeeping");
  var errLog = require("debug")("nqmQueryHub:error:houseKeeping");
  var config = require("../config.json").houseKeeping;
  var _ = require("lodash");
  var util = require("util");
  var started = false;
  var highFrequencyTimer;

  log("loading...");

  var expireTrustedZones = function() {
    var ZoneConnectionModel = require("./models").ZoneConnectionModel;
    log("expiring trusted zones");
    ZoneConnectionModel.update({expires: { $lte: new Date() }, status: {$in: ["trusted","issued"]}},{ status: "expired" },{multi:true},function(err) {
      if (err) {
        errLog("failure expiring trusted zones: %s",err.message);
      }
    });
  };

  var expireShareTokens = function() {
    var ShareTokenModel = require("./models").ShareTokenModel;
    log("removing expired share tokens");
    ShareTokenModel.remove({expires: { $lte: new Date() }},function(err) {
      if (err) {
        errLog("failure removing share tokens: %s",err.message);
      }
    });
  };

  var highFrequencyTick = function() {
    expireTrustedZones();
    expireShareTokens();
  };

  var start = function() {
    if (!started) {
      highFrequencyTick();
      highFrequencyTimer = setInterval(highFrequencyTick,config.highFrequencyTimer);
      started = true;
      log("housekeeping started");
    } else {
      errLog("housekeeping already running");
    }
  };

  var stop = function() {
    if (started) {
      clearInterval(highFrequencyTimer);
      highFrequencyTimer = undefined;
      started = false;
    }
  };

  return {
    start: start,
    stop: stop
  }
}());
