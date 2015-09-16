/**
 * Created by toby on 21/08/15.
 */

exports.Projection = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:WidgetProjection");
  var errLog = require("debug")("nqmQueryHub:WidgetProjection:error");
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

  function WidgetProjection() {
    log("constructor");
    ProjectionQueue.call(this);
  }
  util.inherits(WidgetProjection, ProjectionQueue);

  WidgetProjection.prototype.start = function() {
    log("starting");
    // Listen for visualisation events.
    return ProjectionQueue.prototype.start.call(this, "Widget");
  };

  WidgetProjection.prototype.onEvent = function(data) {
    var promise;

    log("got event %s with data %j",data.__event, data);
    switch (data.__event) {
      case "created":
        promise = VisualisationModel.findOneAsync({ id: data.visId })
          .then(function(visualisation) {
            if (!visualisation) {
              return Promise.reject(new Error("visualisation not found: %s",data.visId));
            }
            var widget = {
              id: data.id,
              title: data.title,
              position: data.position,
              type: data.type,
              inputs: data.inputs
            };
            visualisation.widgets.push(widget);
            return visualisation.saveAsync();
          })
          .catch(persistError);
        break;
      case "moved":
        promise = VisualisationModel.findOneAsync({ id: data.visId })
          .then(function(visualisation) {
            if (!visualisation) {
              return Promise.reject(new Error("visualisation not found: %s",data.visId));
            }
            var widget = _.find(visualisation.widgets,function(w) { return w.id === data.id; });
            if (!widget) {
              return Promise.reject(new Error(util.format("widget %s not found at visualisation %s",data.id,data.visId)));
            }
            widget.position = data.position;
            return visualisation.saveAsync();
          })
          .catch(persistError);
        break;
      case "deleted":
        promise = VisualisationModel.findOneAsync({ id: data.visId })
          .then(function(visualisation) {
            if (!visualisation) {
              return Promise.reject(new Error("visualisation not found: %s",data.visId));
            }
            _.remove(visualisation.widgets, function(w) { return w.id === data.id });
            return visualisation.saveAsync();
          })
          .catch(persistError);
        break;
      default:
        promise = Promise.reject(new Error(util.format("unrecognised widget event: %s",data.__event)));
        break;
    }

    return promise;
  };

  return WidgetProjection;
}());