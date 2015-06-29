/**
 * Created by toby on 23/06/15.
 */

"use strict";

exports.Listener = (function() {
  var log = require("debug")("httpQueryListener");
  var Promise = require("bluebird");
  var restify = require("restify");
  var hubCache = require("./hubCache");
  var datasetAPI = require("./datasetAPI");

  function QueryListener(config) {
    this._config = config;
  }

  QueryListener.prototype.start = function() {
    return startServer();
  };

  var startServer = function() {
    var server = restify.createServer({
      name: 'nqmHub',
      version: '1.0.0'
    });
    Promise.promisifyAll(Object.getPrototypeOf(server));
    server.use(restify.acceptParser(server.acceptable));
    server.use(restify.queryParser());
    server.use(restify.bodyParser());

    server.get("/hub/:id", function (req, res, next) {
      var id = req.params.id;
      log("get hub with id %s", id);

      hubCache.getHub(id,  function(err, hub) {
        if (err && err.message === "not found") {
          err.statusCode = 404;
        }
        next.ifError(err);
        res.send(hub);
        next();
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

      datasetAPI.getIOTData(hubId, feedId, from, to, sortBy, sortDir, limit, skip, function(err, docs) {
        next.ifError(err);
        res.send(docs);
        next();
      });
    };
    server.get("/timeseries/:hubId/:feedId", timeSeriesHandler.bind(this));

    return server.listenAsync(this._config.port);
  };

  return QueryListener;

}());