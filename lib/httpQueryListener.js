/**
 * Created by toby on 23/06/15.
 */

exports.Listener = (function() {
  "use strict";

  var log = require("debug")("nqm-query:httpQueryListener");
  var errLog = require("debug")("nqm-query:httpQueryListener:error");
  var util = require("util");
  var Promise = require("bluebird");
  var restify = require("restify");
  var restifyOAuth = require("restify-oauth2");
  var apiVersion = "/v1";       // ToDo - use middleware pre-hook for api versioning.
  var queryAPI = require("./queryAPI");
  var queryAuth = require("./queryAuth");
  var passport = require("passport");
  var constants = require("nqm-constants");
  var shortId = require("shortid");
  var GoogleStrategy = require("passport-google-oauth").OAuth2Strategy;
  var _ = require("lodash");
  var _queryDB = require("nqm-read-model");
  var _apiTokenTTL = 10*60*1000;

  function QueryListener() {
    this._config = null;
  }

  QueryListener.prototype.start = function(config) {
    this._config = config;
    return startServer.call(this);
  };

  var startServer = function() {
    var self = this;
    log("starting server");

    var server = restify.createServer({
      name: 'nqm-query',
      version: "1.0.0"
    });

    Promise.promisifyAll(Object.getPrototypeOf(server));
    server.use(restify.acceptParser(server.acceptable));
    server.use(restify.authorizationParser());
    server.use(restify.queryParser());
    server.use(restify.bodyParser({mapParams: false}));
    server.use(passport.initialize());

    // TODO - review all these
    restify.CORS.ALLOW_HEADERS.push('accept');
    restify.CORS.ALLOW_HEADERS.push('origin');
    restify.CORS.ALLOW_HEADERS.push('authorization');
    restify.CORS.ALLOW_HEADERS.push('content-type');
    restify.CORS.ALLOW_HEADERS.push('withcredentials');
    restify.CORS.ALLOW_HEADERS.push('x-requested-with');
    restify.CORS.ALLOW_HEADERS.push('sid');
    restify.CORS.ALLOW_HEADERS.push('lang');
    server.use(restify.CORS());

    // Initialise client-credentials oauth support.
    restifyOAuth.cc(server, { tokenEndpoint: "/token", hooks: queryAuth });

    // Set up a static route to serve the authenticate page.
    server.get(/\/authenticate\/?.*/, restify.serveStatic({
      directory: './public',
      default: 'authenticate.html'
    }));

    // The google authentication route.
    server.get("/auth/google", function(req,res,next) {
      // Pass the return URL as state to google authenticate flow.
      var returnURL = req.query.rurl;
      var authFunc = passport.authenticate("google", { session: false, state: returnURL, scope: "https://www.googleapis.com/auth/plus.profile.emails.read" });
      return authFunc(req, res, next);
    });

    // Google authentication callback.
    server.get("/auth/google/callback", passport.authenticate("google", { session: false, failureRedirect: "/authenticate" }),
      function(req,res,next) {
        log("google auth callback - user is %s", req.user.email);

        // Find user account for the logged in user.
        _queryDB.models().AccountModel.findOneAsync({id: req.user.email})
          .then(function(account) {
            if (!account) {
              errLog("no account for user %s", req.user.email);
              return Promise.reject(new Error("no account"));
            }
            // Find user share token.
            return _queryDB.models().ShareTokenModel.findOneAsync({scope: account.id, subject: account.id, status: constants.trustedStatus, expires: {$gt: Date.now() } });
          })
          .then(function(share) {
            if (!share) {
              errLog("no account capability for %s", req.user.email);
              return Promise.reject(new Error("no account capability"));
            }
            // Create API Token.
            var accessToken = new _queryDB.models().AccessTokenModel();
            accessToken.id = shortId.generate();
            accessToken.subject = share.subject;
            accessToken.issued = Date.now();
            accessToken.expires = Date.now() + _apiTokenTTL;
            accessToken.ref = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            return accessToken.saveAsync().return(accessToken);
          })
          .then(function(accessToken) {
            log("api token created: %j", accessToken);
            var decoded = decodeURIComponent(req.query.state);
            var newParam = "access_token=" + accessToken.id;
            var redirectTo = ~decoded.indexOf("?") ? (req.query.state + encodeURIComponent("&" + newParam)) : (req.query.state + encodeURIComponent("?" + newParam));
            decoded = decodeURIComponent(redirectTo);
            log("redirecting to %s",redirectTo);
            res.redirect(decoded,next);
          })
          .catch(restify.HttpError, function(err) {
            next(err);
          })
          .catch(function(err) {
            next(new restify.InternalError(err.message));  
          });
      }
    );

    var resourceViewServer = function(server, req, res, next) {
      var id = req.params.id;
      return _queryDB.models().ResourceModel.findOneAsync({id: id})
        .then(function(resource) {
          if (!resource) {
            errLog("resource not found: %s", id);
            return Promise.reject(new restify.NotFoundError("resource not found: " + id));
          }
          return resource;
        })
        .then(function(resource) {
          if (resource.shareMode === constants.publicReadShareMode || resource.shareMode === constants.publicShareMode) {
            // Resource is public - permit.
            log("permitting read access to %s - resource is public", id);
            return server(id, req, res, next);
          }
  
          // Resource not public - check for bearer token.
          return queryAuth.authenticate(req, res, next)
            .then(function (authData) {
              if (!authData) {
                return Promise.reject(new restify.UnauthorizedError("not authenticated"));
              }
              // Need to check that the authenticated user has access to the requested resource.
              return queryAuth.authorised(resource, authData);
            })
            .then(function (resource) {
              // All good => forward to server.
              return server(id, req, res, next);
            })
        })
        .catch(function(err) {
          next(err);
        });
    };
  
    var tryJSONParse = function(inp,def) {
      var obj = def;
      try {
        if (inp) {
          obj = JSON.parse(inp);
        }
      } catch (e) {
        errLog("failed to parse %s: [%s]",inp,e.message);
        throw new restify.InvalidArgumentError("failed to parse " + inp + " [" + e.message + "]");
      }
      return obj;
    };
  
    var getQueryParams = function(req) {
      var queryParams = {};
      try {
        queryParams.filter = tryJSONParse(req.params.filter || "{}");
        log("filter is: ",queryParams.filter);
        queryParams.projection = tryJSONParse(req.params.proj, { _id: false, __v: false });
        log("projection is: ", queryParams.projection);
        queryParams.options = tryJSONParse(req.params.opts, {});
        queryParams.options.limit = queryParams.options.limit || 1000;
        log("options are: ", queryParams.options);
        return Promise.resolve(queryParams);
      } catch(err) {
        return Promise.reject(err);
      }
    };
    
    var getDatasetMeta = function(id, req, res, next) {
      log("get dataset with id %s", id);
      return queryAPI.getDatasetMeta(id)
        .then(function(ds) {
          var sendDS = ds.toObject();
          sendDS.dataUrl = util.format("%s/datasets/%s/data?access_token=%s", self._config.rootURL, id, (req.clientId ? req.clientId.accessToken.id : ""));
          res.send(sendDS);
          next();
        });
    };
    
    var getDatasetData = function(id, req, res, next) {
      log("get dataset data with id %s", id);
      return getQueryParams(req)
        .then(function(queryParams) {
          res.write("{ metaDataUrl: ");
          res.write(util.format("%s/datasets/%s?access_token=%s", self._config.rootURL, id, (req.clientId ? req.clientId.accessToken.id : "")));
          res.write(", data: [");
          return queryAPI.getDatasetData(id, queryParams.filter, queryParams.projection, queryParams.options, function (doc) {
            log("sending doc: %j", doc);
            res.write(JSON.stringify(doc));
            log("sent doc");
          })
        })
        .then(function() {
          log("all data");
          res.write("] }");
          res.end();
          next();
        })
        .catch(function(err) {
          log("getDatasetData failure: %s", err.message);
          return Promise.reject(err);
        });
    };

    var getDatasetDataCount = function(id, req, res, next) {
      log("get count of dataset data with id %s", id);
      return getQueryParams(req)
        .then(function(queryParams) {
          return queryAPI.getDatasetDataCount(id, queryParams.filter)
            .then(function(count) {
              var ret = {
                metaDataUrl: util.format("%s/datasets/%s?access_token=%s",self._config.rootURL, id, (req.clientId ? req.clientId.accessToken.id : "")),
                count: count
              };
              res.send(ret);
              next();
            });
        });
    };

    var getDatasetDataDistinct = function(id, req, res, next) {
      log("get distinct dataset data with id %s", id);
      var key = req.params.key;
      if (!key) {
        return Promise.reject(new restify.InvalidArgumentError("key not specified"));
      }

      return getQueryParams(req)
        .then(function(queryParams) {
          return queryAPI.getDatasetDataDistinct(id, key, queryParams.filter)
            .then(function(data) {
              var ret = {
                metaDataUrl: util.format("%s/datasets/%s?access_token=%s",self._config.rootURL, id, (req.clientId ? req.clientId.accessToken.id : "")),
                data: data
              };
              res.send(ret);
              next();
            });
        });
    };

    var getDatasetImportConfig = function(id, req, res, next) {
      log("get dataset with id %s", id);
      return queryAPI.getDatasetMeta(id)
        .then(function(ds) {
          var importConfig = require("../importTemplate.json");
      
          importConfig.targetDataset.id = ds.id;
          importConfig.targetDataset.scheme = ds.scheme;
          importConfig.targetDataset.uniqueIndex = ds.uniqueIndex.map(function(i) { return i.asc || i.desc });
      
          res.send(importConfig);
          next();
        });
    };
    
    server.get(apiVersion + "/datasets", function(req, res, next) {
      // Check for bearer token.
      return queryAuth.authenticate(req, res, next)
        .then(function (authData) {
          if (!authData) {
            return Promise.reject(new restify.UnauthorizedError("not authenticated"));
          }
          if (authData.capability) {
            // TODO - support capability-based dataset lookup?
            return Promise.reject(new restify.UnauthorizedError("can't discover datasets using capability token"));
          }
  
          // This is an oauth-based api token, get the user account.
          return _queryDB.models().AccountModel.findOneAsync({id: authData.accessToken.subject});
        })
        .then(function (account) {
          if (!account) {
            errLog("oauth - denied by missing account");
            return Promise.reject(new restify.InternalError("no account found for " + authData.accessToken.subject));
          }
  
          return [account, getQueryParams(req)];
        })
        .spread(function(account, queryParams) {
          var ids = _.map(account.resources, function (v, k) {
            return k;
          });
          return _queryDB.models().DatasetModel.find({$and: [{ id: {$in: ids}}, queryParams.filter]}, queryParams.projection, queryParams.options);
        })
        .then(function(datasets) {
          res.send(datasets);
          next();
        })
        .catch(restify.HttpError, function(err) {
          next(err);
        })
        .catch(function(err) {
          next(new restify.InternalError(err.message));
        });
    });
    
    server.get(apiVersion + "/datasets/:id", function(req, res, next) {
      return resourceViewServer(getDatasetMeta, req, res, next);
    });

    server.get(apiVersion + "/datasets/:id/data", function(req, res, next) {
      return resourceViewServer(getDatasetData, req, res, next);
    });

    server.get(apiVersion + "/datasets/:id/count", function(req, res, next) {
      return resourceViewServer(getDatasetDataCount, req, res, next);
    });

    server.get(apiVersion + "/datasets/:id/distinct", function(req, res, next) {
      return resourceViewServer(getDatasetDataDistinct, req, res, next);
    });

    server.get(apiVersion + "/datasets/:id/import/config", function(req, res, next) {
      return resourceViewServer(getDatasetImportConfig, req, res, next);
    });
    
    return server.listenAsync(this._config.port).then(function() { log("listening on port: " + self._config.port); });
  };

  // Set up google strategy.
  passport.use(new GoogleStrategy({
      clientID: "1051724674890-6qk768hmaatgl2810lc4n9qbns08emqh.apps.googleusercontent.com",
      clientSecret: "jP9mX2UsxqW8Dy1yVCWwSZHO",
      callbackURL: "/auth/google/callback"
    },
    function(accessToken, refreshToken, profile, done) {
      // Successful access of google profile info - extract 'account' email.
      var email = _.find(profile.emails,function(e) { return e.type === "account"; });
      if (email) {
        // Set e-mail as request authentication.
        log("logged into google as %s",email.value);
        done(null, { accessToken: accessToken, refreshToken: refreshToken, email: email.value });
      } else {
        // TODO - review what it means to not have an 'account' type email.
        done(new Error("no valid email found"));
      }
    }
  ));

  return QueryListener;
}());