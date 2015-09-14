
/**
 * Created by toby on 21/08/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:VisualisationProjection");
  var errLog = require("debug")("nqmQueryHub:VisualisationProjection:error");
  var Promise = require("bluebird");
  var ProjectionQueue = require("./projectionQueue");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var VisualisationModel = require("../models/visualisationModel");

  var persistError = function(err) {
    errLog("failed to save model: %s", err.message);
    throw err;
  };

  function VisualisationProjection() {
    log("constructor");
    ProjectionQueue.call(this);
  }
  util.inherits(VisualisationProjection, ProjectionQueue);

  VisualisationProjection.prototype.start = function() {
    log("starting");
    // Listen for visualisation events.
    return ProjectionQueue.prototype.start.call(this, "Visualisation");
  };

  VisualisationProjection.prototype.onEvent = function(data) {
    var promise;

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        var persist = new VisualisationModel();
        persist.id = data.id;
        persist.owner = data.owner;
        persist.shareMode = data.shareMode;
        persist.name = data.name;
        persist.description = data.description;
        persist.tags = data.tags;
        persist.widgets = {};
        promise = persist.saveAsync().catch(persistError);
        break;
      case "deleted":
        promise = VisualisationModel.findOneAsync({ id: data.id })
          .then(function(persist) { return persist.removeAsync().return(persist); })
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