/**
 * Created by toby on 24/06/15.
 */
"use strict";

exports.Projection = (function() {
  var log = require("debug")("DatasetProjection");
  var DatasetModel = require("../models").DatasetModel;
  var Promise = require("bluebird");
  var DatasetProjectionBase = require("./datasetProjectionBase");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");

  function DatasetProjection() {
    log("constructor");
    DatasetProjectionBase.call(this, DatasetModel);
  }
  util.inherits(DatasetProjection, DatasetProjectionBase);

  DatasetProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new DatasetModel();
        persist.id = data.id;
        persist.name = data.name;
        persist.scheme = data.schema;
        persist.store = data.store;
        persist.dataUrl = util.format("%s/datasets/%s/data",config.rootURL,data.id);
        persist.version = data.__version;
        promise = persist.saveAsync()
          .then(function() { return self.startDataProjection(persist); });
        break;
      case "renamed":
        promise = DatasetModel.findOneAsync({id: data.id})
          .then(function(persist) { persist.name = data.name; persist.version = data.__version; return persist.saveAsync(); });
        break;
      case "schemaSet":
        promise = DatasetModel.findOneAsync({id: data.id})
          .then(function(persist) { persist.scheme = data.schema; persist.version = data.__version; return persist.saveAsync().return(persist); })
          .then(function(persist) { return self.startDataProjection(persist); });
        break;
      case "deleted":
        promise = DatasetModel.findOneAsync({id: data.id})
          .then(function(persist) { return self.stopDataProjection(persist).return(persist); })
          .then(function(persist) { return persist.removeAsync().return(persist); })
          .then(function(persist) {
            var mongoose = require("mongoose");
            log("dataset deleted => dropping dataset data collection %s",persist.store);
            return mongoose.connection.db.dropCollection(persist.store, function(err) {
              if (err) {
                // This usually means the collection doesn't exist, so we can
                // ignore it.
                log("failed to drop collection %s - [%s]", persist.store, err.message);
              }
              return Promise.resolve();
            });
          });
        break;
      default:
        log("unrecognised dataset event: %s",data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return DatasetProjection;
}());
