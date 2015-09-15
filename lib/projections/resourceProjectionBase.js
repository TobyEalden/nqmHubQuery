/**
 * Created by toby on 30/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:resourceProjectionBase");
  var errLog = require("debug")("nqmQueryHub:resourceProjectionBase:error");
  var Promise = require("bluebird");
  var ProjectionQueue = require("./projectionQueue");
  var _ = require("lodash");
  var util = require("util");
  var ResourceModel = require("../models/resourceModel");
  var permissions = require("../permissions");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    return Promise.reject(err);
  };

  function ResourceProjectionBase(Model) {
    log("constructor");
    this._ModelClass = Model;
    ProjectionQueue.call(this);
  }
  util.inherits(ResourceProjectionBase, ProjectionQueue);

  var singlePropertyChange = function(lookup, data, targetProperty, sourceProperty) {
    sourceProperty = sourceProperty || targetProperty;
    return this._ModelClass.findOneAsync(lookup)
      .then(function(persist) {
        persist[targetProperty] = data[sourceProperty];
        persist.modified = new Date(data.__timestamp);
        persist.version = data.__version;
        return persist;
      })
      .then(function(persist) { persist.saveAsync(); return persist; })
      .then(function(persist) { return updateResourceCache(persist, data.shareMode); })
      .catch(persistError);
  };

  ResourceProjectionBase.prototype.create = function(data) {
    log("creating resource with params %j", data);
    var resource = new this._ModelClass();
    resource.id = data.id;
    resource.owner = data.owner;
    resource.name = data.name;
    resource.description = data.description;
    resource.shareMode = data.shareMode;
    resource.version = data.__version;
    resource.created = new Date(data.__timestamp);
    return resource;
  };

  var addToResourceCache = function(type, resource) {
    var cache = new ResourceModel();
    cache.type = type;
    cache.id = resource.id;
    cache.owner = resource.owner;
    cache.shareMode = resource.shareMode;
    // Needed for sorting (mongo doesn't support case insensitivity).
    cache.name = resource.name.toLowerCase();
    return cache.saveAsync()
      .then(function() { return permissions.addResource(cache); })
      .return(resource);
  };

  var updateResourceCache = function(resource, shareMode) {
    return ResourceModel.findOneAsync({id: resource.id})
      .then(function(cache) {
        cache.name = resource.name.toLowerCase();
        var shareChange = Promise.resolve(cache);
        if (shareMode && shareMode !== cache.shareMode) {
          cache.shareMode = shareMode;
          shareChange = permissions.changeResourceShareMode(cache);
        }
        return Promise.all([cache.saveAsync(), shareChange]);
      }).return(resource);
  };

  var removeFromResourceCache = function(resource) {
    return ResourceModel.findOneAsync({id: resource.id})
      .then(function(cache) { return permissions.removeResource(cache); })
      .then(function(cache) { return cache.removeAsync(); })
      .return(resource);
  };

  ResourceProjectionBase.prototype.created = function(resource) {
    var self = this;
    return resource.saveAsync()
      .then(function() { return addToResourceCache(self._ModelClass.modelName, resource); });
  };

  ResourceProjectionBase.prototype.descriptionChanged = function(lookup,data) {
    return singlePropertyChange.call(this, lookup, data, "description");
  };

  ResourceProjectionBase.prototype.renamed = function(lookup,data) {
    return singlePropertyChange.call(this, lookup, data, "name");
  };

  ResourceProjectionBase.prototype.tagsChanged = function(lookup,data) {
    return singlePropertyChange.call(this, lookup, data, "tags");
  };

  ResourceProjectionBase.prototype.shareModeSet = function(lookup,data) {
    return singlePropertyChange.call(this, lookup, data, "shareMode");
  };

  ResourceProjectionBase.prototype.deleted = function(resource) {
    return resource.removeAsync()
      .then(function() { return removeFromResourceCache(resource); });
  };

  return ResourceProjectionBase;
}());
