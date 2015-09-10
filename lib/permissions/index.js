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
  var TrustedUserModel = require("../models/trustedUserModel");
  var AccountModel = require("../models/accountModel");
  var DatasetModel = require("../models/datasetModel");
  var url = require("url");

  var addAccountAccess = function(account, resource, access, source) {
    if (!account.resources.hasOwnProperty(resource.id)) {
      account.resources[resource.id] = {
        id: resource.id,
        access: access,
        source: source
      };
      account.markModified("resources");
      return account.saveAsync().return(account);
    } else {
      return Promise.resolve(account);
    }
  };

  var addPublicAccess = function(resource) {
    var localZoneLookup = config.toolboxURL + "/" + resource.owner;

    // Find all zones that trust the resource owner.
    // TODO - add hooks to maintain this status, e.g. when the owner revokes trust.
    return TrustedUserModel.findAsync({ remoteStatus: "trusted", expires: {$gt: new Date() }, server: localZoneLookup })
      .then(function(trusts) {
        if (!trusts) {
          return Promise.resolve();
        } else {
          // Get all accounts for the trusted zones.
          var accountIds = [];

          _.each(trusts, function(t) {
            accountIds.push(t.owner);
          });

          return AccountModel.findAsync({id: {$in: accountIds}})
            .then(function(accounts) {
              if (!accounts) {
                return Promise.resolve();
              } else {
                var promises = [];

                _.each(accounts, function(account) {
                  promise.push(addAccountAccess(account,resource,"read","public"));
                  if (!account.resources.hasOwnProperty(resource.id)) {
                    account.resources[resource.id] = {
                      id: resource.id,
                      access: "read",
                      source: "public"
                    };
                    account.markModified("resources");
                    promises.push(account.saveAsync());
                  }
                });

                return Promise.all(promises);
              }
            });
        }
      });
  };

  var removePublicAccess = function(resource) {
    var localZoneLookup = config.toolboxURL + "/" + resource.owner;

    // Find all zones that trust the resource owner.
    // TODO - add hooks to maintain this status, e.g. when the owner revokes trust.
    return TrustedUserModel.findAsync({ remoteStatus: "trusted", expires: {$gt: new Date() }, server: localZoneLookup })
      .then(function(trusts) {
        // Get all accounts for the trusted zones.
        var accountIds = [];
        _.each(trusts, function(t) {
          accountIds.push(t.owner);
        });

        return AccountModel.findAsync({id: {$in: accountIds}})
          .then(function(accounts) {
            var promises = [];

            _.each(accounts, function(account) {
              if (account.resources.hasOwnProperty(resource.id) && account.resources[resource.id].source === "public") {
                delete account.resources[resource.id];
                account.markModified("resources");
                promises.push(account.saveAsync());
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
  };

  var newTrustedUser = function(trustedUser) {
    var promise;

    if (trustedUser.remoteStatus === "trusted" && trustedUser.server && trustedUser.expires > Date.now()) {
      /*****
       * A new trusted connection has been added.
       *
       * remoteStatus === "trusted" implies that zone 'owner' is trusted by zone 'server'
       *
       * Here we update the owner account so that all public resources published by zone 'server'
       * are visible on zone 'owner'
       */

      // Parse the server zone id.
      var serverParsed = url.parse(trustedUser.server);
      var serverZone = serverParsed.pathname.substr(1);
      if (serverParsed.protocol + "//" + serverParsed.host !== config.toolboxURL) {
        // TODO - what to do when the server zone is not on the same hub?
        throw new Error("NOT IMPLEMENTED - server zone is not local");
      }

      // Get the accounts.
      promise = AccountModel.findOneAsync({id: trustedUser.owner })
        .then(function(ownerAccount) {
          if (!ownerAccount) {
            return Promise.resolve();
          }

          // Get all public resources owned by server zone.
          return DatasetModel.findAsync({owner: serverZone, shareMode: "public"})
            .then(function(docs) {
              _.each(docs, function(doc) {
                if (!ownerAccount.resources.hasOwnProperty(doc.id)) {
                  ownerAccount.resources[doc.id] = {
                    id: doc.id,
                    access: "read"
                  }
                  ownerAccount.markModified("resources");
                }
              });
              return ownerAccount.saveAsync();
            });
        });
    } else {
      promise = Promise.resolve();
    }

    return promise;
  };

  return {
    newTrustedUser: newTrustedUser,
    addResource: addResource,
    changeResourceShareMode: changeResourceShareMode
  }
}());