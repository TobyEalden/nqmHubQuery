/**
 * Created by toby on 21/08/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqm-query:queryAuth");
  var errLog = require("debug")("nqm-query:queryAuth:error");
  var Promise = require("bluebird");
  var restify = require("restify");
  var passport = require("passport");
  var BearerStrategy = require("passport-http-bearer").Strategy;
  var config = require("../config.json");
  var _authServer = require("nqm-auth-server").api;
  var _queryModels = require("nqm-read-model").models;

  var _apiTokenTimeout = 60 * 60 * 1000;

  passport.use(new BearerStrategy(function(token,cb) {
    _queryModels().ApiTokenModel.findOne({id: token}, cb);
  }));

  var doAuthentication = function(req, res, next, cb) {
    if (!req.clientId) {
      var authHeader = req.headers.authorization || req.query.access_token;
      if (!authHeader) {
        log("redirecting to authentication");
        var authURL = "/authenticate";
        var redirectURL = (req.isSecure()) ? 'https' : 'http' + '://' + req.headers.host + req.url;
        res.header("Location", authURL + "?rurl=" + redirectURL);
        res.send(302, authURL);
        return next();
      } else {
        authenticateToken(authHeader, req, cb);
      }
    } else {
      cb(null, req.clientId);
    }
  };

  var doAuthorisation = function(capability, id) {
    // Get resource.
    log("checking authorisation for resource %s", id);
    return _queryModels().ResourceModel.findOneAsync({id: id})
      .then(function(resource) {
        if (!resource) {
          errLog("resource not found: %s",id);
          return Promise.reject(new Error("resource not found: " + id));
        }
        if (!capability.checkAccess(resource.owner, "res." + id, "read")) {
          errLog("denied by capability");
          return Promise.reject(new Error("permission denied"));
        }
        return resource;
      });
  };

  var grantClientToken = function (credentials, req, cb) {
    // Proxy to command interface.
    log("proxying grantClientToken request to command interface");
    var client = restify.createJsonClient({ url: "http://localhost:3102", version: "*", headers: {"authorization": req.headers.authorization } });
    var params = req.body;
    client.post("/token", params, function(err, cmdReq, cmdResp, cmdObj) {
      if (err) {
        errLog("failure granting client token: %s",err.message);
        cb(err, false);
      } else {
        // TODO - check status code?
        log("api token created: %j", cmdObj);
        cb(null, cmdObj.access_token);
      }
    });
  };

  var authenticateToken = function (tokenId, req, cb) {
    _queryModels().ApiTokenModel.findOneAsync({id: tokenId})
      .then(function(apiToken) {
        // TODO - spoofing check - find 3rd party module to help
        var referrer = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (!apiToken) {
          errLog("api token not found or deleted: %s",tokenId);
          return cb(null, false);
        } else if (apiToken.issued > Date.now() || apiToken.touched + _apiTokenTimeout < Date.now()) {
          errLog("api token expired");
          return cb(null, false);
        } else if (apiToken.ref !== referrer) {
          errLog("api token bad referrer %s - %s",referrer, apiToken.ref);
          return cb(null, false);
        } else {
          // TODO - touch token.
          //apiToken.touch();
          req.clientId = _authServer().validateToken(apiToken.tokenId);
          return cb(null, req.clientId);
        }
      });
  };

  return {
    authenticate: doAuthentication,
    authorised: doAuthorisation,
    grantClientToken: grantClientToken,
    authenticateToken: authenticateToken
  };
}());

