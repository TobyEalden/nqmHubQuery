/**
 * Created by toby on 23/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:datasetAPI");
  var errLog = require("debug")("nqmQueryHub:error");
  var util = require("util");
  var DatasetModel = require("./models").DatasetModel;
  var IOTHubModel = require("./models").IOTHubModel;
  var IOTFeedModel = require("./models").IOTFeedModel;
  var DataModelFactory = require("./models").DynamicModel;

  var getFeedData = function(hubId, feedId, from, to, sortBy, sortDir, limit, skip, cb) {
    var query = {};
    if (!isNaN(from)) {
      query["datum.timestamp"] = { $gte: from };
      if (!isNaN(to)) {
        query["datum.timestamp"].$lte = to;
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

    IOTFeedModel.findOne({ hubId: hubId, id: feedId }, function(err, feed) {
      if (feed) {
        var DataModel = DataModelFactory.createModel(feed.store, feed.scheme);
        DataModel.find(query, fields, options, cb);
      } else {
        errLog("feed '%s' not found at hub '%s'", feedId, hubId);
        cb(new Error("not found"));
      }
    });
  };

  var getDataset = function(dsId, cb) {
    DatasetModel.findOne({ "id": dsId}, { _id: false, __v: false }, cb);
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

    DatasetModel.findOne(query, function(err, dataset) {
      if (dataset) {
        var DataModel = DataModelFactory.createModel(dataset.store, dataset.scheme);
        DataModel.find({}, fields, options, cb);
      } else {
        errLog("dataset '%s' not found", dsId);
        cb(new Error("not found"));
      }
    });
  };

  var getHub = function(hubId, cb) {
    IOTHubModel.findOne({ "id": hubId}, { _id: false, __v: false }, cb);
  };

  var getFeed = function(hubId, feedId, cb) {
    IOTFeedModel.findOne({ "hubId": hubId, "id": feedId }, { _id: false, __v: false }, cb);
  };

  var getFeeds = function(hubId, cb) {
    IOTFeedModel.find({ "hubId": hubId }, { _id: false, __v: false }, cb);
  };

  return {
    getDataset: getDataset,
    getDatasetData: getDatasetData,
    getFeedData: getFeedData,
    getHub: getHub,
    getFeed: getFeed,
    getFeeds: getFeeds
  };
}());