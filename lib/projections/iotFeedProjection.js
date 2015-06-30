/**
 * Created by toby on 28/06/15.
 */
"use strict";

exports.Projection = (function() {
  var log = require("debug")("IOTFeedProjection");
  var IOTFeedModel = require("../models/iotFeedModel");
  var Promise = require("bluebird");
  var DatasetProjectionBase = require("./datasetProjectionBase");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");

  function IOTFeedProjection() {
    log("constructor");
    DatasetProjectionBase.call(this, IOTFeedModel);
  }
  util.inherits(IOTFeedProjection, DatasetProjectionBase);

  IOTFeedProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new IOTFeedModel();
        persist.id = data.id;
        persist.hubId = data.hubId;
        persist.name = data.name;
        persist.scheme = data.schema;
        persist.store = data.store;
        persist.dataUrl = util.format("%s/timeseries/%s/%s",config.rootURL,data.hubId,data.id);
        persist.version = data.__version;
        promise = persist.saveAsync()
          .then(function() { return self.startDataProjection(persist); });
        break;
      case "renamed":
        promise = IOTFeedModel.findOneAsync({hubId: data.hubId, id: data.id})
          .then(function(persist) { persist.name = data.name; persist.version = data.__version; return persist.saveAsync(); });
        break;
      case "schemaSet":
        promise = IOTFeedModel.findOneAsync({hubId: data.hubId, id: data.id})
          .then(function(persist) { persist.scheme = data.schema; persist.version = data.__version; return persist.saveAsync().then(function() { return persist; });})
          .then(function(persist) { return self.startDataProjection(persist); });
        break;
      case "deleted":
        promise = IOTFeedModel.findOneAsync({hubId: data.hubId, id: data.id})
          .then(function(persist) { return self.stopDataProjection(persist).return(persist); })
          .then(function(persist) { return persist.removeAsync().return(persist); })
          .then(function(persist) {
            var mongoose = require("mongoose");
            log("dataset deleted => dropping feed data collection %s",persist.store);
            return mongoose.connection.db.dropCollection(persist.store, function(err) {
              if (err) {
                // This usually means the collection doesn't exist, so we can
                // ignore it.
                log("failed to drop collection %s - [%s]", persist.store, err.message);
              }
              return Promise.resolve();
            });
          })
          .catch(persistError);
        break;
      default:
        log("unrecognised iotFeed event: %s",data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return IOTFeedProjection;
}());