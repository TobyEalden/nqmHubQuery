/**
 * Created by toby on 28/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQuery:dynamicModel");
  var errLog = require("debug")("nqmQuery:dynamicModel:error");
  var mongoose = require("mongoose");
  var Promise = require("bluebird");
  var _ = require("lodash");

  function createModel(name, datasetSchema, uniqueIndex) {
    var schema = new mongoose.Schema(datasetSchema);

    // Schema index is stored kind of backwards because mongodb does not allow
    // key names to contain '.' so we store indexes (which are likely to contain
    // dots e.g. if indexing on nested document) in the form
    // { "asc": "my.nested.key" } or { "desc": "address.postcode" }
    // Here we swap the key name and direction round so that we can pass it to
    // mongodb.
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