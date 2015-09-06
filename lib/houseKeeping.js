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

  var expireTrustedUsers = function() {
    var TrustedUserModel = require("./models").TrustedUser;
    log("expiring trusted users");
    TrustedUserModel.update({expires: { $lte: new Date() }, status: {$in: ["trusted","pending"]}},{ status: "expired" },{multi:true},function(err) {
      if (err) {
        errLog("failure expiring trusted users: %s",err.message);
      }
    });
  };

  var expireShareTokens = function() {
    var ShareTokenModel = require("./models").ShareToken;
    log("removing expired share tokens");
    ShareTokenModel.remove({expires: { $lte: new Date() }},function(err) {
      if (err) {
        errLog("failure removing share tokens: %s",err.message);
      }
    });
  };

  var highFrequencyTick = function() {
    expireTrustedUsers();
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
