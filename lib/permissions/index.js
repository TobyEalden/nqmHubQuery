/**
 * Created by toby on 10/09/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:Permissions");
  var errLog = require("debug")("nqmQueryHub:error:Permissions");
  var Promise = require("bluebird");
  var config = require("../../config.json");
  var _ = require("lodash");
  var util = require("util");
  var ZoneConnectionModel = require("../models/zoneConnectionModel");
  var AccountModel = require("../models/accountModel");
  var DatasetModel = require("../models/datasetModel");
  var url = require("url");

  var saveAccount = function(account) {
    account.modified = new Date();
    account.markModified("resources");
    return account.saveAsync().return(account);
  };

  var addAccountAccess = function(account, resource, access, source) {
    if (!account.resources) {
      account.resources = {};
    }
    if (!account.resources.hasOwnProperty(resource.id)) {
      account.resources[resource.id] = {
        id: resource.id,
        access: access,
        source: source
      };
      return saveAccount(account);
    } else {
      return Promise.resolve(account);
    }
  };

  var addPublicAccess = function(resource) {
    // Find all zones that trust the resource owner.
    return ZoneConnectionModel.findAsync({ status: "trusted", expires: {$gt: new Date() }, owner: resource.owner })
      .then(function(trusts) {
        if (!trusts) {
          return Promise.resolve();
        } else {
          // Get all accounts for the trusted zones.
          var accountIds = [];

          _.each(trusts, function(t) {
            accountIds.push(t.other);
          });

          return AccountModel.findAsync({id: {$in: accountIds}})
            .then(function(accounts) {
              if (!accounts) {
                return Promise.resolve();
              } else {
                var promises = [];

                _.each(accounts, function(account) {
                  promises.push(addAccountAccess(account,resource,"read","public"));
                });

                return Promise.all(promises);
              }
            });
        }
      });
  };

  var removePublicAccess = function(resource) {
    // Find all zones that trust the resource owner.
    return ZoneConnectionModel.findAsync({ status: "trusted", expires: {$gt: new Date() }, owner: resource.owner })
      .then(function(trusts) {
        // Get all accounts for the trusted zones.
        var accountIds = [];
        _.each(trusts, function(t) {
          accountIds.push(t.other);
        });

        return AccountModel.findAsync({id: {$in: accountIds}})
          .then(function(accounts) {
            var promises = [];

            _.each(accounts, function(account) {
              if (account.resources.hasOwnProperty(resource.id) && account.resources[resource.id].source === "public") {
                delete account.resources[resource.id];
                promises.push(saveAccount(account));
              }
            });

            return Promise.all(promises);
          });
      });
  };

  var changeResourceShareMode = function(resource) {
    var promise;

    if (resource.shareMode !== "public") {
      promise = removePublicAccess(resource);
    } else {
      promise = addPublicAccess(resource);
    }

    return promise;
  };

  var addPublicResource = function(resource) {
    /***************************************************************
     * Update all trusted accounts with access to the new resource.
     */
    return addPublicAccess(resource);
  };

  var addResource = function(resource) {
    return AccountModel.findOneAsync({id: resource.owner})
      .then(function(account) {
        if (!account) {
          return Promise.reject(new Error("no account found for resource owner: " + resource.owner));
        }

        return addAccountAccess(account, resource, "write", "owner")
          .then(function() {
            var promise;
            switch (resource.shareMode) {
              case "public":
                promise = addPublicResource(resource);
                break;
              case "specific":
                errLog("TODO - implement 'specific' share mode");
                promise = Promise.resolve();
                break;
              case "private":
                promise = Promise.resolve();
                break;
            }
            return promise;
          });
      });
  };

  var addTrustedZone = function(trustedZone) {
    var promise;

    if (trustedZone.expires > Date.now()) {
      /*****
       * A new trusted connection has been added.
       *
       * Here we update the 'other' account so that all public resources published by zone 'owner'
       * are visible on zone 'other'
       */

      if (trustedZone.otherServer !== config.toolboxURL) {
        // TODO - what to do when the other zone is not on the same hub?
        throw new Error("NOT IMPLEMENTED - other zone is not local");
      }

      // Get the 'other' account.
      promise = AccountModel.findOneAsync({id: trustedZone.other })
        .then(function(trustedAccount) {
          if (!trustedAccount) {
            return Promise.reject(new Error("trusted account not found!"));
          }

          // Get all public resources owned by 'owner' zone.
          return DatasetModel.findAsync({owner: trustedZone.owner, shareMode: "public"})
            .then(function(docs) {
              _.each(docs, function(doc) {
                if (!trustedAccount.resources.hasOwnProperty(doc.id)) {
                  trustedAccount.resources[doc.id] = {
                    id: doc.id,
                    access: "read",
                    source: "public"
                  }
                }
              });
              return saveAccount(trustedAccount);
            });
        });
    } else {
      promise = Promise.resolve();
    }

    return promise;
  };

  var removeTrustedZone = function(trustedUser) {
    var promise;

    if (trustedUser.status === "trusted") {
      /*****
       * A trusted connection has been removed.
       *
       * Here we update the 'other' account so that all public resources published by zone 'owner'
       * are no longer visible on zone 'other'
       */

      if (trustedUser.otherServer !== config.toolboxURL) {
        // TODO - what to do when the other zone is not on the same hub?
        throw new Error("NOT IMPLEMENTED - other zone is not local");
      }

      // Get the account.
      promise = AccountModel.findOneAsync({id: trustedUser.other })
        .then(function(trustedAccount) {
          if (!trustedAccount) {
            return Promise.reject(new Error("trusted account not found!"));
          }

          // Get all public resources owned by zone.
          return DatasetModel.findAsync({owner: trustedUser.owner })
            .then(function(docs) {
              _.each(docs, function(doc) {
                delete trustedAccount.resources[doc.id];
              });
              return saveAccount(trustedAccount);
            });
        });
    } else {
      promise = Promise.resolve();
    }

    return promise;
  };

  return {
    addTrustedZone: addTrustedZone,
    removeTrustedZone: removeTrustedZone,
    addResource: addResource,
    changeResourceShareMode: changeResourceShareMode
  }
}());