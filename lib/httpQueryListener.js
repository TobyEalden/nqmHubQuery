/**
 * Created by toby on 23/06/15.
 */

exports.Listener = (function() {
  "use strict";

  var log = require("debug")("nqm-query:httpQueryListener");
  var errLog = require("debug")("nqm-query:httpQueryListener:error");
  var Promise = require("bluebird");
  var restify = require("restify");
  var restifyOAuth = require("restify-oauth2");
  var apiVersion = "/v1";       // ToDo - use middleware pre-hook for api versioning.
  var queryAPI = require("./queryAPI");
  var queryAuth = require("./queryAuth");
  var passport = require("passport");
  var GoogleStrategy = require("passport-google-oauth").OAuth2Strategy;
  var _ = require("lodash");
  var _queryDB = require("nqm-read-model");

  function QueryListener() {
    this._config = null;
  }

  QueryListener.prototype.start = function(config) {
    this._config = config;
    return startServer.call(this);
  };

  var apiError = function(err, doc, next) {
    if (!err && !doc) {
      err = new Error("not found");
      err.statusCode = 404;
    }
    next.ifError(err);
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

    restify.CORS.ALLOW_HEADERS.push('accept');
    restify.CORS.ALLOW_HEADERS.push('sid');
    restify.CORS.ALLOW_HEADERS.push('lang');
    restify.CORS.ALLOW_HEADERS.push('origin');
    restify.CORS.ALLOW_HEADERS.push('authorization');
    restify.CORS.ALLOW_HEADERS.push('content-type');
    restify.CORS.ALLOW_HEADERS.push('withcredentials');
    restify.CORS.ALLOW_HEADERS.push('x-requested-with');
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
        _queryDB.models.AccountModel.findOneAsync({email: req.user.email})
          .then(function(account) {
            if (!account) {
              errLog("no account for user %s", req.user.email);
              return Promise.reject(new Error("no account"));
            }
            // Find user share token.
            return _queryDB.models.ShareTokenModel.findOneAsync({scope: account.id, subject: req.user.email, status: "trusted", expires: {$gt: Date.now() } });
          })
          .then(function(share) {
            if (!share) {
              errLog("no account capability for %s", req.user.email);
              return Promise.reject(new Error("no account capability"));
            }
            log("get API token from command oauth endpoint");
            var client = restify.createJsonClient({ url: "http://localhost:3102", version: "*", headers: {"authorization": "Basic " + share.scope + ":" + share.authId } });
            var params = { "grant_type": "client_credentials" };
            client.post("/token", params, function(err, cmdReq, cmdResp, cmdObj) {
              if (err || cmdResp.statusCode !== 200) {
                errLog("failure creating API token. Status code: %d, error: %s", cmdResp.statusCode, err.message);
                next.ifError(err);
              } else {
                log("api token created: %j", cmdObj);
                var redirectTo = decodeURIComponent(req.query.state + "?access_token=" + cmdObj.access_token);
                log("redirecting to %s",redirectTo);
                res.redirect(redirectTo,next);
              }
            });
          });
      }
    );

    server.get(apiVersion + "/datasets/:id", function(req, res, next) {
      // Check for bearer token.
      queryAuth.authenticate(req, res, next, function(err, capability) {
        if (err || !capability) {
          return next.ifError(err || new Error("not authenticated"));
        }

        // Got a valid token - get request resource Id.
        var id = req.params.id;

        // Need to check that the authenticated user has access to the requested resource.
        queryAuth.authorised(capability, id)
          .then(function(resource) {
            if (!resource) {
              res.statusCode = 401;
              res.contentType = "text/plain";
              res.send("not authorised");
              next();
            } else {
              log("get dataset with id %s", id);
              queryAPI.getDataset(id, function(err, ds) {
                apiError(err, ds, next);
                if (ds) {
                  res.send(ds);
                  next();
                }
              });
            }
          })
          .catch(function(err) {
            res.send(400,err.message);
          });
      });
    });

    server.get(apiVersion + "/datasets/:id/data", function(req, res, next) {
      // Check for bearer token.
      queryAuth.authenticate(req, res, next, function(err, capability) {
        if (err || !capability) {
          return next.ifError(err || new Error("not authenticated"));
        }
        // Got a valid token - get request resource Id.
        var id = req.params.id;

        // Need to check that the authenticated user has access to the requested resource.
        queryAuth.authorised(capability, id)
          .then(function(resource) {
            if (!resource) {
              res.statusCode = 401;
              res.contentType = "text/plain";
              res.send("not authorised");
              next();
            } else {
              log("get dataset data with id %s", id);
              var limit = parseInt(req.params.limit) || 1000;
              var skip = parseInt(req.params.skip) || 0;
              var sortBy = req.params.sortBy;
              if (!isNaN(sortBy)) {
                // sortBy is a number, so assume it is actually a skip value.
                skip = parseInt(sortBy);
              }
              sortBy = sortBy || "_id";
              var sortDir = req.params.sortDir || "asc";

              queryAPI.getDatasetData(id, sortBy, sortDir, limit, skip, function(err, data) {
                apiError(err, data, next);
                if (data) {
                  res.send(data);
                  next();
                }
              });
            }
          })
          .catch(function(err) {
            res.send(400,err.message);
          });
      });
    });

    server.get(apiVersion + "/datasets/:id/importconfig", function(req, res, next) {
      var id = req.params.id;
      log("get dataset with id %s", id);
      queryAPI.getDataset(id, function(err, ds) {
        apiError(err, ds, next);
        if (ds) {
          var importConfig = require("../importTemplate.json");

          importConfig.targetDataset.id = ds.id;
          importConfig.targetDataset.scheme = ds.scheme;
          importConfig.targetDataset.uniqueIndex = ds.uniqueIndex.map(function(i) { return i.asc || i.desc });

          res.send(importConfig);
          next();
        }
      });
    });

    server.get(apiVersion + "/hubs/:id", function (req, res, next) {
      var id = req.params.id;
      log("get hub with id %s", id);

      queryAPI.getHub(id, function(err, hub) {
        apiError(err, hub, next);
        if (hub) {
          res.send(hub);
          next();
        }
      });
    });

    var getDateParam = function(param) {
      var dt;
      if (isNaN(param)) {
        dt = Date.parse(param);
      } else {
        dt = parseInt(param);
      }
      return dt;
    };

    var timeSeriesHandler = function(req, res, next) {
      var feedId = req.params.feedId;
      var from = getDateParam(req.params.from);
      var to = getDateParam(req.params.to);
      var limit = parseInt(req.params.limit) || 1000;
      var skip = parseInt(req.params.skip) || 0;
      var sortBy = req.params.sortBy;
      if (!isNaN(sortBy)) {
        // sortBy is a number, so assume it is actually a skip value.
        skip = parseInt(sortBy);
      }
      sortBy = sortBy || "timestamp";
      var sortDir = req.params.sortDir || "asc";

      queryAPI.getFeedData(feedId, from, to, sortBy, sortDir, limit, skip, function(err, docs) {
        apiError(err, docs, next);
        res.send(docs);
        next();
      });
    };
    server.get(apiVersion + "/timeseries/:feedId", timeSeriesHandler.bind(this));

    return server.listenAsync(this._config.port)
      .then(function() { log("listening on port: " + self._config.port); });
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