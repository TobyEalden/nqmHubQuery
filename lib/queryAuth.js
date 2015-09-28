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
  var shortId = require("shortid");
  var _authServer = require("nqm-auth-server").api;
  var _queryModels = require("nqm-read-model").models;
  var constants = require("nqm-constants");
  var _apiTokenTTL = 10*60*1000;
  var _queryDB = require("nqm-read-model");

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

  var doAuthorisation = function(resource, authData) {
    // Get resource.
    var id = resource.id;
    log("checking authorisation for resource %s", id);
    if (authData.capability) {
      // This is a capability-based api token.
      if (resource.shareMode === constants.privateShareMode) {
        errLog("denied by private share mode");
        return Promise.reject(new Error("resource not found: " + id));
      }
      if (resource.shareMode === constants.specificShareMode && !authData.capability.checkAccess(resource.owner, constants.resourceScope + id, constants.readAccess)) {
        errLog("denied by capability");
        return Promise.reject(new Error("permission denied"));
      }
      return Promise.resolve(resource);
    } else {
      // This is an oauth-based api token, get the user account.
      return _queryModels().AccountModel.findOneAsync({email: authData.apiToken.subject})
        .then(function(account) {
          if (!account) {
            return Promise.reject(new Error("doAuthorisation - no account found for " + authData.apiToken.subject));
          }
          if (account.resources.hasOwnProperty(id) && account.resources[id][constants.readAccess]) {
            return resource;
          } else {
            return Promise.reject(new Error("permission denied"));
          }
        });
    }
  };

  var grantClientToken = function (credentials, req, cb) {
    var credentials = req.authorization.credentials.split(":");
    if (credentials.length < 2) {
      errLog("grantClientToken - invalid credentials: %s", req.authorization.credentials);
      return cb(null, false);
    }
    var user = credentials[0];
    var secret = credentials[1];
    log("grantClientToken for %s", user);
    _authServer().lookupToken(secret)
      .then(function(capabilityToken) {
        if (capabilityToken && capabilityToken.id && capabilityToken.issued < Date.now() && capabilityToken.expires > Date.now()) {
          // Create API Token.
          var apiToken = new _queryDB.models().ApiTokenModel();
          apiToken.id = shortId.generate();
          apiToken.subject = user;
          apiToken.shortId = capabilityToken.shortId;
          apiToken.tokenId = capabilityToken.id;
          apiToken.issued = Date.now();
          apiToken.expires = Date.now() + _apiTokenTTL;
          // TODO - spoofing check - find 3rd party module to help
          apiToken.ref = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
          apiToken.saveAsync()
            .then(function () {
              log("api token created: %j", apiToken);
              cb(null, apiToken.id);
            })
            .catch(function (err) {
              errLog("failure creating API token, error: %s", err.message);
              cb(null, false);
            });
        } else {
          errLog("authServer couldn't find token for %s",secret);
          cb(null, false);
        }
      })
      .catch(function(err) {
        errLog("authServer token lookup failed: %s",err.message);
        cb(null, false);
      });
  };

  var authenticateToken = function (tokenId, req, cb) {
    _queryModels().ApiTokenModel.findOneAsync({id: tokenId})
      .then(function(apiToken) {
        if (!apiToken) {
          return Promise.delay(1000).then(function() {
            return _queryModels().ApiTokenModel.findOneAsync({id: tokenId});
          })
        } else {
          return apiToken;
        }
      })
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
          var authData = {
            apiToken: apiToken,
          };
          if (apiToken.tokenId) {
            _authServer().lookupToken(apiToken.tokenId)
              .then(function(capabilityToken) {
                authData.capability = capabilityToken;
                req.clientId = authData;
                return cb(null, req.clientId);
              })
              .catch(function(err) {
                errLog("failure looking up token %s",apiToken.tokenId);
                cb(null, false);
              })
          } else {
            req.clientId = authData;
            return cb(null, req.clientId);
          }
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

