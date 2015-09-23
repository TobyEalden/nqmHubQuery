/**
 * Created by toby on 21/08/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqm-query:queryAuth");
  var errLog = require("debug")("nqm-query:queryAuth:error");
  var Promise = require("bluebird");
  var passport = require("passport");
  var BearerStrategy = require("passport-http-bearer").Strategy;
  var readModels = require("nqm-read-model");
  var APIToken = readModels.ApiTokenModel;
  var ZoneConnection = readModels.ZoneConnectionModel;
  var ShareToken = readModels.ShareTokenModel;
  var ResourceModel = readModels.ResourceModel;
  var config = require("../config.json");

  passport.use(new BearerStrategy(function(token,cb) {
    APIToken.findOne({id: token}, cb);
  }));

  var doAuthentication = function(req, res, next, cb) {
    var authFunc = passport.authenticate("bearer", function(err, accessToken, info) {
      if (err) {
        return next(err);
      }
      if (!accessToken || accessToken.token.ref !== req.connection.remoteAddress || accessToken.token.exp <= Date.now()) {
        if (!accessToken) {
          log("no access token");
        } else {
          if (accessToken.token.ref !== req.connection.remoteAddress) {
            log("access token referrer invalid: %s vs %s",accessToken.token.ref, req.connection.remoteAddress);
          }
          if (accessToken.token.exp <= Date.now()) {
            log("access token expired: %d",accessToken.token.exp);
          }
        }
        log("redirecting to authentication");
        var authURL = "/authenticate";
        var redirectURL = (req.isSecure()) ? 'https' : 'http' + '://' + req.headers.host + req.url;
        res.header("Location", authURL + "?rurl=" + redirectURL);
        res.send(302, authURL);
        return next();
      } else {
        // TODO - Touch api token?
      }
      return cb(accessToken);
    });

    return authFunc(req,res,next);
  };

  var doAuthorisation = function(accessToken, id) {
    // Get resource.
    log("checking authorisation for resource %s", id);
    return ResourceModel.findOneAsync({id: id})
      .then(function(resource) {
        if (!resource) {
          errLog("resource not found: %s",id);
          return Promise.reject(new Error("resource not found: " + id));
        }
        // Get trusted zone that owns the accessToken
        return [resource, ZoneConnection.findOneAsync({
          owner: resource.owner,
          otherEmail: accessToken.token.sub,
          status: "trusted",
          expires: {$gt: new Date()}
        })];
      })
      .spread(function(resource, trustedZone) {
        if (!trustedZone) {
          errLog("trusted zone not found between %s and %s", resource.owner, accessToken.token.sub);
          return Promise.reject(new Error("no trusted zone for: " + accessToken.token.sub));
        }

        // Find share token for the user/scope.
        return ShareToken.findAsync({
          userId: accessToken.token.sub,
          scope: resource.owner,
          expires: {$gt: new Date()},
          resources: {
            $elemMatch: {
              "resource": id,
              "actions": "read"
            }
          }
        });
      })
      .then(function(tokens) {
        log("user %s, resource %s, found %d suitable share tokens", accessToken.token.sub, id, tokens.length);
        return tokens;
      });
  };

  return {
    authenticate: doAuthentication,
    authorised: doAuthorisation
  };
}());

