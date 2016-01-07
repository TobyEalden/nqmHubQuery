/**
 * Created by toby on 23/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqm-query:queryAPI");
  var errLog = require("debug")("nqm-query:queryAPI:error");
  var Promise = require("bluebird");
  var util = require("util");
  var restify = require("restify");
  var _queryModels = require("nqm-read-model").models;
  var _queryDB = require("nqm-read-model").db;
  var _ = require("lodash");
  var constants = require("nqm-constants");
  
  var getDatasetMeta = function(dsId, cb) {
    return _queryModels().DatasetModel.findOneAsync({ "id": dsId}, { _id: false, __v: false })
      .then(function(ds) {
        if (!ds) {
          return Promise.reject(new restify.NotFoundError("dataset not found: " + dsId));
        }
        return ds;
      })
  };
  
  var createDerivedLookup = function(dataset, filter, projection) {
    projection = projection || {};
    if (dataset.derived && dataset.derived.source) {
      var lookup = { $and: [] };
      if (filter) {
        lookup.$and.push(filter);
      }
      return doCreateDerivedLookup(dataset, lookup, projection)
        .then(function(derivedLookup) {
          if (derivedLookup.lookup.$and.length === 0) {
            delete derivedLookup.lookup.$and;
          }
          return derivedLookup;
        })
    } else {
      return Promise.resolve({ lookup: filter, projection: projection, sourceDataset: dataset });
    }
  };
  
  var doCreateDerivedLookup = function(dataset, lookup, projection) {
    return _queryModels().DatasetModel.findOneAsync({id: dataset.derived.source})
      .then(function(sourceDataset) {
        if (!sourceDataset) {
          return Promise.reject(new Error("derived dataset source missing: " + dataset.derived.source));
        }
        
        var createLookup = function(source) {
          _.forEach(dataset.derived.fields, function(v) {
            if (v.enforce.indexOf(constants.writeAccess) >= 0) {
              var obj = {};
              obj[v.name] = v.constraint;
              lookup.$and.push(obj);
            }
            if (v.exclude) {
              projection[v.name] = 0;
            }
          });
          return { lookup: lookup, projection: projection, sourceDataset: source};
        };
        
        if (sourceDataset.derived.source) {
          return doCreateDerivedLookup(sourceDataset, lookup, projection).then(function(source) { return createLookup(source.sourceDataset); });
        } else {
          return createLookup(sourceDataset);
        }
      })
  };
  
  var getDatasetData = function(dsId, filter, projection, options, cb) {
    return _queryModels().DatasetModel.findOneAsync({id: dsId})
      .then(function(dataset) {
        if (dataset) {
          return createDerivedLookup(dataset, filter, projection);
        } else {
          errLog("dataset '%s' not found", dsId);
          return Promise.reject(new restify.NotFoundError("dataset not found: " + dsId));
        }
      })
      .then(function(derivedLookup) {
        var DataModel = _queryModels().DynamicModel.createModel(_queryDB(), derivedLookup.sourceDataset.store, derivedLookup.sourceDataset.scheme);
        log("compiled query is %j, %j, %j", derivedLookup.lookup, derivedLookup.projection, options);

        return new Promise(function(resolve, reject) {
          DataModel.find(derivedLookup.lookup, derivedLookup.projection, options).stream()
            .on("data", function(doc) {
              log("data callback");
              cb(doc);
            })
            .on("error", function(err) {
              log("error callback");
              reject(err);
            })
            .on("end", function() {
              log("end callback");
              resolve();
            });
        });
      })
      .catch(function(err) {
        errLog("getDatasetData: '%s' failure: %s", dsId,err.message);
        return Promise.reject(new restify.InternalServerError(err.message));
      });
  };

  var getDatasetDataInMemory = function(dsId, filter, projection, options) {
    return _queryModels().DatasetModel.findOneAsync({id: dsId})
      .then(function(dataset) {
        if (dataset) {
          return createDerivedLookup(dataset, filter, projection);
        } else {
          errLog("dataset '%s' not found", dsId);
          return Promise.reject(new restify.NotFoundError("dataset not found: " + dsId));
        }
      })
      .then(function(derivedLookup) {
        var DataModel = _queryModels().DynamicModel.createModel(_queryDB(), derivedLookup.sourceDataset.store, derivedLookup.sourceDataset.scheme);
        log("compiled query is %j, %j, %j", derivedLookup.lookup, derivedLookup.projection, options);
        return DataModel.findAsync(derivedLookup.lookup, derivedLookup.projection, options);
      })
      .catch(function(err) {
        errLog("getDatasetDataInMemory: '%s' failure: %s", dsId,err.message);
        return Promise.reject(new restify.InternalServerError(err.message));
      });
  };

  var getDatasetDataCount = function(dsId, filter) {
    return _queryModels().DatasetModel.findOneAsync({id: dsId})
      .then(function(dataset) {
        if (dataset) {
          return createDerivedLookup(dataset, filter);
        } else {
          errLog("dataset '%s' not found", dsId);
          return Promise.reject(new restify.NotFoundError("dataset not found: " + dsId));
        }
      })
      .then(function(derivedLookup) {
        var DataModel = _queryModels().DynamicModel.createModel(_queryDB(), derivedLookup.sourceDataset.store, derivedLookup.sourceDataset.scheme);
        log("compiled query is %j, %j", derivedLookup.lookup, derivedLookup.projection);
        return DataModel.find(derivedLookup.lookup, derivedLookup.projection).countAsync();
      })
      .catch(function(err) {
        errLog("getDatasetDataCount: '%s' failure: %s", dsId,err.message);
        return Promise.reject(new restify.InternalServerError(err.message));
      });
  };

  var getDatasetDataDistinct = function(dsId, key, filter) {
    return _queryModels().DatasetModel.findOneAsync({id: dsId})
      .then(function(dataset) {
        if (dataset) {
          return createDerivedLookup(dataset, filter);
        } else {
          errLog("dataset '%s' not found", dsId);
          return Promise.reject(new restify.NotFoundError("dataset not found: " + dsId));
        }
      })
      .then(function(derivedLookup) {
        var DataModel = _queryModels().DynamicModel.createModel(_queryDB(), derivedLookup.sourceDataset.store, derivedLookup.sourceDataset.scheme);
        log("compiled query is %j, %j", derivedLookup.lookup, derivedLookup.projection);
        return DataModel.distinctAsync(key, derivedLookup.lookup);
      })
      .catch(function(err) {
        errLog("getDatasetDataDistinct: '%s' failure: %s", dsId,err.message);
        return Promise.reject(new restify.InternalServerError(err.message));
      });
  };

  return {
    getDatasetMeta: getDatasetMeta,
    getDatasetData: getDatasetData,
    getDatasetDataCount: getDatasetDataCount,
    getDatasetDataDistinct: getDatasetDataDistinct
  };
}());