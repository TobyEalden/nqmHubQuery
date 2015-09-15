
/**
 * Created by toby on 21/08/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:VisualisationProjection");
  var errLog = require("debug")("nqmQueryHub:VisualisationProjection:error");
  var Promise = require("bluebird");
  var ResourceProjectionBase = require("./resourceProjectionBase");
  var util = require("util");
  var VisualisationModel = require("../models/visualisationModel");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    return Promise.reject(err);
  };

  function VisualisationProjection() {
    log("constructor");
    ResourceProjectionBase.call(this, VisualisationModel);
  }
  util.inherits(VisualisationProjection, ResourceProjectionBase);

  VisualisationProjection.prototype.start = function() {
    log("starting");
    // Listen for visualisation events.
    return ResourceProjectionBase.prototype.start.call(this, "Visualisation");
  };

  VisualisationProjection.prototype.onEvent = function(data) {
    var self = this;
    var promise;
    var lookup = { id: data.id };

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = this.create(data);
        persist.widgets = [];
        promise = this.created(persist).catch(persistError);
        break;
      case "descriptionChanged":
        promise = this.descriptionChanged(lookup, data).catch(persistError);
        break;
      case "renamed":
        promise = this.renamed(lookup, data).catch(persistError);
        break;
      case "shareModeSet":
        promise = this.shareModeSet(lookup, data).catch(persistError);
        break;
      case "tagsChanged":
        promise = this.tagsChanged(lookup, data).catch(persistError);
        break;
      case "deleted":
        promise = VisualisationModel.findOneAsync({ id: data.id })
          .then(function(persist) { return self.deleted(persist); })
          .catch(persistError);
        break;
      default:
        promise = Promise.reject(new Error(util.format("unrecognised visualisation event: %s",data.__event)));
        break;
    }

    return promise;
  };

  return VisualisationProjection;
}());