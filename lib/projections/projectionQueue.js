/**
 * Created by toby on 28/06/15.
 */

"use strict";

module.exports = (function() {
  var log = require("debug")("nqmQueryHub:ProjectionQueue");
  var errLog = require("debug")("nqmQueryHub:error");
  var Promise = require("bluebird");
  var eventBus = require("../eventBusClient");
  var SyncStatusModel = require("../models/syncStatusModel");
  var _  = require("lodash");

  var processError = function(err) {
    errLog("****** FAILURE PROCESS EVENT **********: %s", err.message);
  };

  var setTimestamp = function(model, t) {
    return SyncStatusModel.findOneAndUpdateAsync({ model: model }, { timestamp: t }, { upsert: true });
  };

  var processQueue = function(queue) {
    var self = this;

    log("processing queue");
    if (queue.length > 0) {
      var nextEvent = queue.shift();
      return self.onEvent(nextEvent)
        .then(function() { setTimestamp(self._key, nextEvent.__timestamp); })
        .then(function() {
          if (queue.length > 0 && !self._stopping) {
            return Promise.delay(0).then(function() { return processQueue.call(self, queue); },0);
          } else {
            return Promise.resolve();
          }
        })
        .catch(processError);
    } else {
      log("queue empty");
      return Promise.resolve();
    }
  };

  var startQueue = function() {
    var self = this;

    // Make sure queue is running.ons
    if (!this._queueRunning) {
      self._queueRunning = true;
      processQueue.call(self, self._queue)
        .then(function() {
          self._queueRunning = false;
          log("finished processing queue");
        });
    }
  };

  var liveHandler = function(data) {
    log("got event %s with data %j",data.__event, data);
    this._queue.push(data);

    if (this._catchingUp) {
      // Do nothing until caught up.
      log("queued received event during catch-up");
    } else {
      startQueue.call(this);
    }
  };

  var catchUpHandler = function(msg) {
    var self = this;

    self._catchUpCount = msg.payload.length;
    if (self._catchUpCount > 0) {
      log("catching up %d events for %s", self._catchUpCount, self._key);

      return processQueue.call(this, msg.payload)
        .then(function() {
          return startCatchUp.call(self);
        })
        .catch(processError);
    } else {
      log("catchup complete");
      self._catchingUp = false;
    }
  };

  var startCatchUp = function() {
    var self = this;
    log("issuing catchup request for %s",self._key);
    return SyncStatusModel.findOneAsync({ model: self._key })
      .then(function(sync) {
        var sinceTimestamp = sync ? sync.timestamp : 0;
        // Issue catchup request for all events since last timestamp.
        return eventBus.catchUp(self._key, sinceTimestamp);
      })
      .then(function(catchupResponse) {
        return catchUpHandler.call(self, catchupResponse);
      });
  };

  function ProjectionQueue() {
    this._key = null;
  }

  ProjectionQueue.prototype.start = function(key) {
    var self = this;
    this._queueRunning = false;
    this._catchingUp = true;
    this._catchUpCount = 0;
    this._queue = [];
    this._key = key;

    // Listen for model events.
    eventBus.subscribe(self._key + ".*", liveHandler.bind(self));

    return startCatchUp.call(self)
      .then(function() {
        log("finished catching up %s - switching to live handler", self._key);
        startQueue.call(self);
      });
  };

  ProjectionQueue.prototype.stop = function() {
    var self = this;
    if (this._catchingUp) {
      // ToDo - investigate.
      errLog("!!!!!!!!!! attempting to stop projection before catch-up is complete");
      this._catchingUp = this._queueRunning = false;
      this._stopping = true;
    }
    return eventBus.unsubscribe(self._key + ".*", liveHandler.bind(self));
  };

  ProjectionQueue.prototype.isCatchingUp = function() {
    return this._catchingUp;
  };

  return ProjectionQueue;
}());