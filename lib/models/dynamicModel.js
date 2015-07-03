/**
 * Created by toby on 28/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:dynamicModel");
  var errLog = require("debug")("nqmQueryHub:error");
  var mongoose = require("mongoose");
  var Promise = require("bluebird");
  var _ = require("lodash");


  function createModel(name, datasetSchema, uniqueIndex) {
    var schema = new mongoose.Schema(datasetSchema);

    var schemaIndex = {};
    _.forEach(uniqueIndex, function(i) {
      schemaIndex[i.asc || i.desc] = i.asc ? 1 : -1;
    });
    schema.index(schemaIndex, { unique: true });

    schema.on("index", function(err) {
      if (err) {
        errLog("failed to create dynamicModel index: %s", err.message);
      }
    });

    // ToDo review - is this safe?
    delete mongoose.connection.models[name];
    var dataModel = mongoose.model(name, schema, name);
    Promise.promisifyAll(dataModel);
    return dataModel;
  }

  return {
    createModel: createModel
  };
}());