/**
 * Created by toby on 23/06/15.
 */

"use strict";

exports.Listener = (function() {
  var log = require("debug")("httpQueryListener");
  var Promise = require("bluebird");
  var restify = require("restify");
  var queryAPI = require("./queryAPI");
  var apiVersion = "/v1";       // ToDo - use middleware pre-hook for api versioning.

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
    var server = restify.createServer({
      name: 'nqmHub',
      version: "1.0.0"
    });
    Promise.promisifyAll(Object.getPrototypeOf(server));
    server.use(restify.acceptParser(server.acceptable));
    server.use(restify.queryParser());
    server.use(restify.bodyParser());

    server.get(apiVersion + "/datasets/:id", function(req, res, next) {
      var id = req.params.id;
      log("get dataset with id %s", id);
      queryAPI.getDataset(id, function(err, ds) {
        apiError(err, ds, next);
        if (ds) {
          res.send(ds);
          next();
        }
      });
    });

    server.get(apiVersion + "/datasets/:id/data", function(req, res, next) {
      var id = req.params.id;
      log("get dataset data with id %s", id);
      var id = req.params.id;
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

    server.get(apiVersion + "/feeds/:hubId", function(req, res, next) {
      log("get all feeds for hub %s", req.params.hubId);
      queryAPI.getFeeds(req.params.hubId, function(err, feeds) {
        apiError(err, feeds, next);
        res.send(feeds);
        next();
      });
    });

    server.get(apiVersion + "/feeds/:hubId/:id", function (req, res, next) {
      log("get feed from hub %s with id %s", req.params.hubId, req.params.id);
      queryAPI.getFeed(req.params.hubId, req.params.id, function(err, feed) {
        apiError(err, feed, next);
        if (feed) {
          res.send(feed);
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
      var hubId = req.params.hubId;
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

      queryAPI.getFeedData(hubId, feedId, from, to, sortBy, sortDir, limit, skip, function(err, docs) {
        apiError(err, docs, next);
        res.send(docs);
        next();
      });
    };
    server.get(apiVersion + "/timeseries/:hubId/:feedId", timeSeriesHandler.bind(this));

    return server.listenAsync(this._config.port);
  };

  return QueryListener;
}());