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
  var ShareTokenModel = require("../models/shareTokenModel");

  var saveAccount = function(account) {
    account.modified = new Date();
    account.markModified("resources");
    return account.saveAsync().return(account);
  };

  var addAccountAccess = function(account, resourceId, access, source) {
    if (!account.resources) {
      account.resources = {};
    }
    if (!account.resources.hasOwnProperty(resourceId)) {
      account.resources[resourceId] = {
        id: resourceId,
        access: access,
        source: source
      };
      return saveAccount(account);
    } else {
      return Promise.resolve(account);
    }
  };

  var removeAccountAccess = function(account, resourceId, source) {
    if (account.resources && account.resources.hasOwnProperty(resourceId) && (!source || account.resources[resourceId].source === source)) {
      delete account.resources[resourceId];
      return saveAccount(account);
    } else {
      return Promise.resolve(account);
    }
  };

  var addPublicAccess = function(resource) {
    // Find all zones the resource owner trusts.
    return ZoneConnectionModel.findAsync({ owner: resource.owner, status: "trusted", expires: {$gt: new Date() } })
      .then(function(trusts) {
        // Get all accounts for the trusted zones.
        var accountIds = _.map(trusts, function(t) { return t.other; });

        return AccountModel.findAsync({id: {$in: accountIds}})
          .then(function(accounts) {
            var promises = _.map(accounts, function(account) {
              return addAccountAccess(account,resource.id,"read","public");
            });
            return Promise.all(promises);
          });
      });
  };

  var addSpecificAccess = function(resource) {
    // Find all zones the resource owner trusts.
    return ZoneConnectionModel.findAsync({ owner: resource.owner, status: "trusted", expires: {$gt: new Date() } })
      .then(function(trusts) {
        var accountIds = _.map(trusts, function(t) { return t.other; });

        // Get all accounts for the trusted zones.
        return AccountModel.findAsync({id: {$in: accountIds}})
          .then(function(accounts) {
            var promises = _.map(accounts, function(account) {
              return addSpecificAccountAccess(account,resource);
            });
            return Promise.all(promises);
          });
      });
  };

  var addSpecificAccountAccess = function(account, resource) {
    return ShareTokenModel.findAsync({ userId: account.email, owner: resource.owner, scope: resource.id })
      .then(function(shares) {
        var promises = _.map(shares, function(share) {
          var access = getShareTokenAccess(share);
          return addAccountAccess(account, resource.id, access, share.id);
        });
        return Promise.all(promises);
      });
  };

  var removeResourceAccess = function(resource, source) {
    // Find all zones that the resource owner trusts.
    return ZoneConnectionModel.findAsync({ owner: resource.owner, status: "trusted", expires: {$gt: new Date() } })
      .then(function(trusts) {
        var accountIds = _.map(trusts, function(t) { return t.other; });

        // Get all accounts for the trusted zones.
        return AccountModel.findAsync({id: {$in: accountIds}})
          .then(function(accounts) {
            // For each account - remove access to the resource.
            var promises = _.map(accounts, function(account) {
              return removeAccountAccess(account,resource.id,source);
            });
            return Promise.all(promises);
          });
      });
  };

  var addResource = function(resource) {
    return AccountModel.findOneAsync({id: resource.owner})
      .then(function(account) {
        if (!account) {
          return Promise.reject(new Error("no account found for resource owner: " + resource.owner));
        }

        // Add read/write access for resource owner account.
        return addAccountAccess(account, resource.id, "write", "owner")
          .then(function() {
            var promise;
            switch (resource.shareMode) {
              case "public":
                promise = addPublicAccess(resource);
                break;
              case "specific":
                // TODO - test/debug.
                debugger;
                promise = addSpecificAccess(resource);
                break;
              case "private":
                promise = Promise.resolve();
                break;
            }
            return promise;
          });
      });
  };

  var changeResourceShareMode = function(resource) {
    var promise;

    if (resource.shareMode !== "public") {
      // Resource not "public" - remove access (TODO - only do this if resource was public?)
      promise = removeResourceAccess(resource,"public")
        .then(function() {
          if (resource.shareMode === "specific") {
            // Resource is shared with specific users.
            return addSpecificAccess(resource);
          } else if (resource.shareMode === "private") {
            // Resource is not shared with anybody.
            return removeResourceAccess(resource);
          } else {
            return Promise.reject(new Error("unknown share mode: " + resource.shareMode));
          }
        });
    } else {
      // Resource is in "public" share mode - add access for all trusted zones.
      promise = addPublicAccess(resource);
    }

    return promise;
  };

  var removeResource = function(resource) {
    // TODO - test/debug this.
    debugger;

    return AccountModel.findOneAsync({id: resource.owner})
      .then(function(account) {
        if (!account) {
          return Promise.reject(new Error("no account found for resource owner: " + resource.owner));
        }

        // Remove access for resource owner account.
        return removeAccountAccess(account, resource.id, "owner")
          .then(function() {
            return removeResourceAccess(resource);
          });
      });
  };

  var addTrustedZone = function(trustedZone) {
    var promise;

    if (trustedZone.status === "trusted" && trustedZone.expires > Date.now()) {
      /*****
       * A new trusted connection has been added.
       *
       * Here we update the 'other' account so that all public resources published by zone 'owner'
       * are visible on zone 'other'
       */

      if (trustedZone.otherServer !== config.toolboxURL) {
        // TODO - what to do when the other zone is not on the same hub?
        return Promise.reject(new Error("NOT IMPLEMENTED - other zone is not local"));
      }

      // Get the 'other' account.
      var ta = AccountModel.findOneAsync({id: trustedZone.other });
      // Get all public resources owned by 'owner' zone.
      var ds = DatasetModel.findAsync({owner: trustedZone.owner,shareMode: "public"});
      promise = Promise.join(ta,ds,function(trustedAccount,docs) {
          if (!trustedAccount) {
            return Promise.reject(new Error("trusted account not found!"));
          }
          trustedAccount.resources = trustedAccount.resources || {};

          // Add public access to the trusted account for each public resource.
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
        })
        .then(function(trustedAccount) {
          // Find any existing share tokens.
          return [trustedAccount, ShareTokenModel.findAsync({
            owner: trustedZone.owner,
            userId: trustedAccount.email,
            expires: {$gt: new Date()},
            status: "trusted" })];
        })
        .spread(function(trustedAccount, shareTokens) {
          var promises = _.map(shareTokens, function(share) {
            return addAccountAccess(trustedAccount, share.scope, getShareTokenAccess(share), share.id);
          });
          return Promise.all(promises);
        });
    } else {
      promise = Promise.resolve();
    }

    return promise;
  };

  var removeTrustedZone = function(trustedZone) {
    var promise;

    if (trustedZone.status === "trusted") {
      /*****
       * A trusted connection has been removed.
       *
       * Here we update the 'other' account so that all public resources published by zone 'owner'
       * are no longer visible on zone 'other'
       */

      if (trustedZone.otherServer !== config.toolboxURL) {
        // TODO - what to do when the other zone is not on the same hub?
        return Promise.reject(new Error("NOT IMPLEMENTED - other zone is not local"));
      }

      // Get the account.
      promise = AccountModel.findOneAsync({id: trustedZone.other })
        .then(function(trustedAccount) {
          if (!trustedAccount) {
            return Promise.reject(new Error("trusted account not found!"));
          }

          // Get all public resources owned by zone.
          return DatasetModel.findAsync({owner: trustedZone.owner })
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

  var getShareTokenAccess = function(share) {
    var access = "none";
    var resource = _.find(share.resources, function(r) { return r.resource === "access"; });
    if (resource && resource.actions.length > 0) {
      access = resource.actions[0];
    }
    return access;
  };

  var addShareToken = function(share) {
    var promise;

    if (share.status === "trusted" && share.expires > new Date()) {
      // Find account.
      promise = AccountModel.findOneAsync({ email: share.userId })      
        .then(function(account) {
          if (!account) {
            // TODO - this might be a share token for an external user - ignore for now.
            //return Promise.reject(new Error("shareTokenAdded - account not found for share: " + share.userId));
            errLog("shareTokenAdded - account not found for share: " + share.userId);
            promise = Promise.resolve(share);
          } else {
            return addAccountAccess(account, share.scope, getShareTokenAccess(share), share.id);            
          }
        });
    } else {
      promise = Promise.resolve();
    }

    return promise;
  };

  var removeShareToken = function(share) {
    var promise;

    // Find account.
    promise = AccountModel.findOneAsync({ email: share.userId })
      .then(function(account) {
        if (!account) {
          // TODO - this might be a share token for an external user - ignore for now.
          //return Promise.reject(new Error("shareTokenRemoved - account not found for share: " + share.userId));
          errLog("shareTokenRemoved - account not found for share: " + share.userId);
          promise = Promise.resolve(share);
        } else {
          promise = removeAccountAccess(account, share.scope, share.id);
        }
      });

    return promise;
  };

  return {
    addTrustedZone: addTrustedZone,
    removeTrustedZone: removeTrustedZone,
    addResource: addResource,
    changeResourceShareMode: changeResourceShareMode,
    removeResource: removeResource,
    addShare: addShareToken,
    removeShare: removeShareToken
  }
}());