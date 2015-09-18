/**
 * Created by toby on 21/08/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQuery:queryAuth");
  var errLog = require("debug")("nqmQuery:queryAuth:error");
  var passport = require("passport");
  var Strategy = require("passport-http-bearer").Strategy;
  var mongoose = require("mongoose");
  var APIToken = mongoose.model("ApiToken");
  var TrustedUser = mongoose.model("TrustedUser");
  var ShareToken = mongoose.model("ShareToken");
  var config = require("../config.json");

  passport.use(new Strategy(function(token,cb) {
    APIToken.findOne({id: token}, cb);
  }));

  var doAuthentication = function(req, res, next, cb) {
    var authFunc = passport.authenticate("bearer", function(err, accessToken, info) {
      if (err) {
        return next(err);
      }
      var uid = req.params.uid;
      if (!accessToken) {
        var authURL = config.toolboxURL + uid + "/authenticate";
        var redirectURL = (req.isSecure()) ? 'https' : 'http' + '://' + req.headers.host + req.url;
        res.header("Location", authURL + "?rurl=" + redirectURL);
        res.send(302, authURL);
        return next();
      }
      return cb(accessToken);
    });

    return authFunc(req,res,next);
  };

  var doAuthorisation = function(accessToken, user, scope, cb) {
    // Get trusted user that owns the accessToken
    TrustedUser.findOne({ id: accessToken.userId, status: "trusted", expires: { $gt: new Date() } }, function(err, trustedUser) {
      if (err) {
        errLog("failure finding trusted user %s - %s", accessToken.userId, err.message);
        cb(err);
      } else {
        if (!trustedUser) {
          log("no trusted user %s found for %s", accessToken.userId, user);
          cb(null);
        } else {
          // Find share token for the user/scope.
          ShareToken.find({ userId: trustedUser.userId, scope: scope, expires: { $gt: new Date() }, "resources.resource": "dataset", "resources.actions": "read" }, function(err, tokens) {
            if (err) {
              errLog("failed to find shareTokens: %s",err.message);
              cb(err);
            } else {
              log("user %s, scope %s, found %d suitable share tokens", user, scope, tokens.length);
              if (tokens.length > 0) {
                cb(null,tokens[0]);
              } else {
                cb(null);
              }
            }
          });
        }
      }
    });
  };

  return {
    authenticate: doAuthentication,
    authorised: doAuthorisation
  };
}());

