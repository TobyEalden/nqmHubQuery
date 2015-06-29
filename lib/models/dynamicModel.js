/**
 * Created by toby on 28/06/15.
 */

"use strict";

module.exports = (function() {
  var mongoose = require("mongoose");
  var Promise = require("bluebird");
  var _ = require("lodash");

  var buildSchema = function(fields) {
    var schema = {};
    _.forEach(fields, function(f) {
      schema[f.name] = {
        type: f.fieldType,
        index: f.key === true
      };
    },this);
    return schema;
  };

  function createModel(name, fields) {
    var dynamic = buildSchema(fields);
    var schema = new mongoose.Schema(dynamic);
    // ToDo - is this safe?
    delete mongoose.connection.models[name];
    var dataModel = mongoose.model(name, schema, name);
    Promise.promisifyAll(dataModel);
    return dataModel;
  }

  return {
    createModel: createModel
  };
}());