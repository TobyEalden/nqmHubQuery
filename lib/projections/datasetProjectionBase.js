/**
 * Created by toby on 30/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:datasetProjectionBase");
  var errLog = require("debug")("nqmQueryHub:error");
  var Promise = require("bluebird");
  var mongoose = require("mongoose");
  var ProjectionQueue = require("./projectionQueue");
  var ServiceDirectoryModel = require("../models/serviceDirectoryModel");
  var _ = require("lodash");
  var util = require("util");
  var permissions = require("../permissions");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  function DatasetProjectionBase(Model) {
    log("constructor");
    this._ModelClass = Model;
    ProjectionQueue.call(this);
  }
  util.inherits(DatasetProjectionBase, ProjectionQueue);

  DatasetProjectionBase.prototype.start = function() {
    var self = this;
    log("starting");
    // Listen for dataset events.
    return ProjectionQueue.prototype.start.call(this, self._ModelClass.modelName)
      .then(function() { return self.startDataProjections(); });
  };

  var dropCollection = Promise.method(function(dataset) {
    log("dataset deleted => dropping %s collection %s",this._ModelClass.modelName, dataset.store);
    return new Promise(function(resolve) {
      mongoose.connection.db.dropCollection(dataset.store, function(err) {
        if (err) {
          // This usually means the collection doesn't exist, so we can ignore it.
          log("failed to drop collection %s - [%s]", dataset.store, err.message);
          // Fall through and resolve.
        }
        resolve();
      });
    });
  });

  var singlePropertyChange = function(lookup, data, targetProperty, sourceProperty) {
    sourceProperty = sourceProperty || targetProperty;
    return this._ModelClass.findOneAsync(lookup)
      .then(function(persist) { persist[targetProperty] = data[sourceProperty]; persist.version = data.__version; return persist; })
      .then(function(persist) { persist.saveAsync(); return persist; })
      .catch(persistError);
  };

  var addToServiceDirectory = function(persist) {
    var sdEntry = new ServiceDirectoryModel();
    sdEntry.owner = persist.owner;
    sdEntry.serviceType = this.getServiceType();
    sdEntry.server = "[local]";
    sdEntry.instance = persist.id;
    return sdEntry.saveAsync();
  };

  DatasetProjectionBase.prototype.onEvent = function(data) {
    var self = this;
    var promise;

    log("got event %s with data %j",data.__event, data);
    var lookup = self.getDatasetKey(data);

    switch (data.__event) {
      case "created":
        var persist = self.onCreateDataset(data);
        promise = persist.saveAsync()
          .then(function() { return permissions.addResource(persist); })
          .then(function() { return addToServiceDirectory.call(self,persist); })
          .then(function() { return self.startDataProjection(persist); })
          .catch(persistError);
        break;
      case "descriptionChanged":
        promise = singlePropertyChange.call(self, lookup, data, "description");
        break;
      case "renamed":
        promise = singlePropertyChange.call(self, lookup, data, "name");
        break;
      case "shareModeSet":
        promise = singlePropertyChange.call(self, lookup, data, "shareMode")
          .then(permissions.changeResourceShareMode)
          .catch(persistError);
        //promise = self._ModelClass.findOneAsync(lookup)
        //  .then(function(persist) {
        //    persist.shareMode = data.shareMode; return persist;
        //  })
        //  .then(function(persist) {
        //    persist.saveAsync();
        //    return persist;
        //  })
        //  .then(function(persist) {
        //    return permissions.changeResourceShareMode(persist);
        //  })
        //  .catch(persistError);
        break;
      case "tagsChanged":
        promise = singlePropertyChange.call(self, lookup, data, "tags");
        break;
      case "schemaSet":
        promise = self._ModelClass.findOneAsync(lookup)
          .then(function(persist) { if (persist) { persist.scheme = data.schema || persist.scheme; persist.uniqueIndex = data.uniqueIndex || persist.uniqueIndex; persist.version = data.__version; } return persist; })
          .then(function(persist) { return persist ? persist.saveAsync().return(persist) : persist; })
          .then(function(persist) { return persist ? self.startDataProjection(persist) : persist; })
          .catch(persistError);
          break;
      case "deleted":
        promise = self._ModelClass.findOneAsync(lookup)
          .then(function(persist) { return persist ? self.stopDataProjection(persist).return(persist) : persist; })
          .then(function(persist) { return persist ? persist.removeAsync().return(persist) : persist; })
          .then(function(persist) { return persist ? dropCollection.call(self, persist) : persist; })
          .catch(persistError);
        break;
      default:
        errLog("unrecognised %s event: %s", self._ModelClass.modelName, data.__event);
        promise = Promise.reject();
        break;
    }

    return promise;
  };

  return DatasetProjectionBase;
}());
