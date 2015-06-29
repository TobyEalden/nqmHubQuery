/**
 * Created by toby on 23/06/15.
 */

"use strict";

module.exports = (function() {
  var log = require("debug")("datasetAPI");
  var mongo = require('../mongoConnectionFactory');

  var getIOTData = function(hubId, feedId, from, to, sortBy, sortDir, limit, skip, cb) {
    var feeds = mongo.queryDb.db().collection("read.IOTData");
    var query = { hubId: hubId, id: feedId };
    if (!isNaN(from)) {
      query["datum.timestamp"] = { $gte: from };
      if (!isNaN(to)) {
        query["datum.timestamp"]["$lte"] = to;
      }
    }
    var fields = {
      datum: true,
      _id: false
    };
    var options = {
      sort: [ [ "datum." + sortBy, sortDir ]],
      limit: limit,
      skip: skip
    };
    feeds.find(query, fields, options).toArray(function(err, datum) {
      if (err) {
        return cb(err);
      }
      cb(null, datum);
    });
  };

  var getHubData = function(hubId, cb) {
    var hubEvents = mongo.commandDb.db().collection("Hub.events");
    var query = { "id": hubId };
    var options = {
      sort: [ [ "__version", 1]]
    };
    hubEvents.find(query, options).toArray(function(err, datum) {
      if (err) {
        return cb(err);
      }
      cb(null, datum);
    });
  };

  return {
    getIOTData: getIOTData,
    getHubData: getHubData
  }
}());