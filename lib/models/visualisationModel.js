/**
 * Created by toby on 14/09/15.
 */

module.exports = (function() {
  "use strict";

  var mongoose = require("mongoose");
  var Promise = require("bluebird");

  var schemaOptions = {
    collection: "Visualisation"
  };

  var widgetSchema = new mongoose.Schema({
    id: String,
    type: String,
    title: String,
    position: {
      x: Number,
      y: Number,
      w: Number,
      h: Number
    },
    inputs: []
  });

  var visualisationSchema = new mongoose.Schema({
    id: String,
    owner: String,
    shareMode: String,
    name: String,
    description: String,
    tags: [String],
    widgets: [widgetSchema]
  }, schemaOptions);

  visualisationSchema.index({ id: 1 }, {unique: true });

  var VisualisationModel = mongoose.model("Visualisation", visualisationSchema);
  Promise.promisifyAll(VisualisationModel);

  return VisualisationModel;
}());
