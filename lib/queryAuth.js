/**
 * Created by toby on 21/08/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqm-query:queryAuth");
  var errLog = require("debug")("nqm-query:queryAuth:error");
  var Promise = require("bluebird");
  var restify = require("restify");
  var config = require("../config.json");
  var shortId = require("shortid");
  var _authServer = require("nqm-auth-server").api;
  var _queryDB = require("nqm-read-model");
  var constants = require("nqm-constants");
  var _apiTokenTTL = 10*60*1000;
  
  var doAuthentication = function(req, res, next) {
    if (!req.clientId) {
      // Not authenticated => check headers and query param.
      var authHeader = req.headers.authorization || req.query.access_token;
      if (!authHeader) {
        log("redirecting to authentication");
        var authURL = "/authenticate";
        var redirectURL = encodeURIComponent((req.isSecure()) ? 'https' : 'http' + '://' + req.headers.host + req.url);
        res.header("Location", authURL + "?rurl=" + redirectURL);
        res.send(302, authURL);
        next();
        return Promise.resolve(false);
      } else {
        return doAuthenticateToken(authHeader, req);
      }
    } else {
      // Already authenticated.
      return Promise.resolve(req.clientId);
    }
  };

  var doAuthorisation = function(resource, authData) {
    var id = resource.id;
    log("checking authorisation for resource %s", id);
    if (authData.capability) {
      // This is a capability-based api token.
      if (resource.shareMode === constants.privateShareMode) {
        errLog("denied by private share mode");
        return Promise.reject(new restify.NotFoundError("resource not found: " + id));
      }
      if (resource.shareMode === constants.specificShareMode && !authData.capability.checkAccess(resource.owner, constants.resourcePrefix + id, constants.readAccess)) {
        errLog("denied by capability");
        return Promise.reject(new Error("permission denied"));
      }
      return Promise.resolve(resource);
    } else {
      // This is an oauth-based api token, get the user account.
      return _queryDB.models().AccountModel.findOneAsync({id: authData.accessToken.subject})
        .then(function(account) {
          if (!account) {
            errLog("oauth - denied by missing account")
            return Promise.reject(new Error("doAuthorisation - no account found for " + authData.accessToken.subject));
          }
          if (account.resources.hasOwnProperty(id) && account.resources[id][constants.readAccess]) {
            return resource;
          } else {
            errLog("oauth - denied by account resources")
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
    var shareId = credentials[0];
    var secret = credentials[1];
    log("grantClientToken for %s", shareId);
    _authServer().lookupShare(shareId, secret)
      .then(function(share) {
        var pass = true;
        // TODO - spoofing check - find 3rd party module to help
        var referrer = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (!share) {
          errLog("share not found: %s", shareId);
          pass = false;
        }
        if (share && share.issued > Date.now()) {
          errLog("bad issue date");
          pass = false;
        }
        if (share && share.expires < Date.now()) {
          errLog("expired");
          pass = false;
        }
        if (share && share.status !== constants.trustedStatus && share.status !== constants.anonymousStatus) {
          errLog("bad status %s", share.status);
          pass = false;
        }
        if (share && share.ref && share.ref !== referrer) {
          errLog("bad referrer %s should be %s",referrer, share.ref);
          pass = false;
        }
        if (share && pass) {
          // Create API Token.
          var accessToken = new _queryDB.models().AccessTokenModel();
          accessToken.id = shortId.generate();
          accessToken.shareId = shareId;
          accessToken.subject = share.subject;
          accessToken.ref = referrer;
          accessToken.issued = Date.now();
          accessToken.expires = Date.now() + _apiTokenTTL;
          accessToken.saveAsync()
            .then(function () {
              log("api token created: %j", accessToken);
              cb(null, accessToken.id);
            })
            .catch(function (err) {
              errLog("failure creating API token, error: %s", err.message);
              cb(null, false);
            });
        } else {
          // Call back with `false` to signal the username/password combination did not authenticate.
          // Calling back with an error would be reserved for internal server error situations.
          cb(null, false);
        }
      })
      .catch(function(err) {
        errLog("authServer token lookup failed: %s",err.message);
        cb(null, false);
      });
  };

  var doAuthenticateToken = function (id, req) {
    return _queryDB.models().AccessTokenModel.findOneAsync({id: id})
      .then(function(accessToken) {
        // TODO - spoofing check - find 3rd party module to help
        var referrer = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (!accessToken) {
          errLog("api token not found or deleted: %s",id);
          return Promise.resolve(false);
        } 
        if (accessToken.issued > Date.now() || accessToken.touched + _apiTokenTTL < Date.now()) {
          errLog("api token expired");
          return Promise.resolve(false);
        } 
        if (accessToken.ref !== referrer) {
          errLog("api token bad referrer %s - %s",referrer, accessToken.ref);
          return Promise.resolve(false);
        } 

        // TODO - touch token.
        //accessToken.touch();
        var authData = { accessToken: accessToken };
        if (accessToken.shareId) {
          return _queryDB.models().ShareTokenModel.findOneAsync({id: accessToken.shareId, status: {$in: [constants.trustedStatus, constants.anonymousStatus]}, expires: {$gt: new Date()} })
            .then(function(share) {
              if (!share) {
                errLog("failed to find trusted, non-expired share %s", accessToken.shareId);
                return Promise.resolve(false);
              } 
              authData.capability = _authServer().createTokenFromShare(share);
              req.clientId = authData;
              return Promise.resolve(req.clientId);
            })
            .catch(function(err) {
              errLog("failure looking up share %s: %s",accessToken.shareId,err.message);
              return Promise.resolve(false);
            });
        } else {
          req.clientId = authData;
          return Promise.resolve(req.clientId);
        }
      });
  };
  
  var authenticateToken = function (id, req, cb) {
    doAuthenticateToken(id, req)
      .then(function(authData) {
        cb(null, authData);
      })
      .catch(function(err) {
        cb(err);
      })
  };
  
  return {
    authenticate: doAuthentication,
    authorised: doAuthorisation,
    grantClientToken: grantClientToken,
    authenticateToken: authenticateToken
  };
}());

