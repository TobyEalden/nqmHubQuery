/**
 * Created by toby on 23/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqm-query:queryAPI");
  var errLog = require("debug")("nqm-query:queryAPI:error");
  var util = require("util");
  var _queryModels = require("nqm-read-model").models;
  var _queryDB = require("nqm-read-model").db;

  var getFeedData = function(feedId, from, to, sortBy, sortDir, limit, skip, cb) {
    var query = {};
    if (!isNaN(from)) {
      query.timestamp = { $gte: from };
      if (!isNaN(to)) {
        query.timestamp.$lte = to;
      }
    }
    var fields = {
      _id: false,
      __v: false
    };
    var options = {
      sort: {},
      limit: limit,
      skip: skip
    };
    options.sort[sortBy] = sortDir;

    _queryModels().DatasetModel.findOne({ id: feedId }, function(err, feed) {
      if (feed) {
        var DataModel = _queryModels().DynamicModel.createModel(_queryDB(), feed.store, feed.scheme);
        DataModel.find(query, fields, options, cb);
      } else {
        errLog("feed '%s' not found", feedId);
        cb(new Error("not found"));
      }
    });
  };

  var getDataset = function(dsId, cb) {
    _queryModels().DatasetModel.findOne({ "id": dsId}, { _id: false, __v: false }, cb);
  };

  var getDatasetData = function(dsId, sortBy, sortDir, limit, skip, cb) {
    var query = { id: dsId };
    var fields = {
      _id: false,
      __v: false
    };
    var options = {
      sort: {},
      limit: limit,
      skip: skip
    };
    options.sort[sortBy] = sortDir;

    _queryModels().DatasetModel.findOne(query, function(err, dataset) {
      if (dataset) {
        var DataModel = _queryModels().DynamicModel.createModel(_queryDB(), dataset.store, dataset.scheme);
        DataModel.find({}, fields, options, cb);
      } else {
        errLog("dataset '%s' not found", dsId);
        cb(new Error("not found"));
      }
    });
  };

  var getHub = function(hubId, cb) {
    _queryModels().IOTHubModel.findOne({ "id": hubId}, { _id: false, __v: false }, cb);
  };

  return {
    getDataset: getDataset,
    getDatasetData: getDatasetData,
    getFeedData: getFeedData,
    getHub: getHub
  };
}());