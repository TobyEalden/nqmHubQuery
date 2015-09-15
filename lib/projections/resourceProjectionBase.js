/**
 * Created by toby on 30/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:resourceProjectionBase");
  var errLog = require("debug")("nqmQueryHub:resourceProjectionBase:error");
  var Promise = require("bluebird");
  var mongoose = require("mongoose");
  var ProjectionQueue = require("./projectionQueue");
  var _ = require("lodash");
  var util = require("util");
  var permissions = require("../permissions");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
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
      .then(function(persist) { persist[targetProperty] = data[sourceProperty]; persist.modified = new Date(data.__timestamp); persist.version = data.__version; return persist; })
      .then(function(persist) { persist.saveAsync(); return persist; })
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

  ResourceProjectionBase.prototype.created = function(resource) {
    return resource.saveAsync() .then(function() { return permissions.addResource(resource); })
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
    return singlePropertyChange.call(this, lookup, data, "shareMode")
      .then(permissions.changeResourceShareMode);
  };

  ResourceProjectionBase.prototype.deleted = function(resource) {
    return resource.removeAsync().then(function() { return permissions.removeResource(resource); })
  };

  return ResourceProjectionBase;
}());
