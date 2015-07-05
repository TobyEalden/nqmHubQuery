/**
 * Created by toby on 28/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQueryHub:ProjectionQueue");
  var errLog = require("debug")("nqmQueryHub:error");
  var Promise = require("bluebird");
  var eventBus = require("../eventBusClient");
  var SyncStatusModel = require("../models/syncStatusModel");
  var _  = require("lodash");

  var abortError = function(err) {
    errLog("ABORTING - event handling failure: %s", err ? err.message : "no error given");

    // Failure to process an event is fatal, as continuing will mean we are
    // out of sync.
    process.exit();
  };

  var setSyncTimestamp = function(model, t) {
    log("saving sync timestamp for %s [%s]", model, t);
    return SyncStatusModel.findOneAndUpdateAsync({ model: model }, { timestamp: t }, { upsert: true });
  };

  var processQueue = function(queue) {
    var self = this;

    log("processing queue");
    if (queue.length > 0) {
      var nextEvent = queue.shift();
      var syncId = nextEvent._id;
      return self.onEvent(nextEvent)
        .then(function() { return setSyncTimestamp(self._key, syncId); })
        .then(function() {
          if (queue.length > 0 && !self._stopping) {
            // Continue processing queue on next tick to avoid stack overflow.
            return Promise.delay(0).then(function() { return processQueue.call(self, queue); },0);
          } else {
            return Promise.resolve();
          }
        });
    } else {
      log("queue empty");
      return Promise.resolve();
    }
  };

  var startLiveQueue = function() {
    var self = this;

    // Make sure queue is running.
    if (!this._queueRunning) {
      self._queueRunning = true;
      return processQueue.call(self, self._queue)
        .then(function() {
          self._queueRunning = false;
          log("finished processing queue");
        });
    } else {
      log("ignoring startQueue - queue already running");
      return Promise.resolve();
    }
  };

  var liveHandler = function(data) {
    log("liveHandler - got event %s with data %j",data.__event, data);
    this._queue.push(data);

    if (this._catchingUp) {
      // Do nothing until caught up.
      log("%s - queued event received during catch-up %j", data);
    } else {
      startLiveQueue.call(this).catch(abortError);
    }
  };

  var catchUpHandler = function(msg) {
    var self = this;

    self._catchUpCount = msg.payload.length;
    if (self._catchUpCount > 0) {
      log("catching up %d events for %s", self._catchUpCount, self._key);

      return processQueue.call(this, msg.payload)
        .then(function() {
          // Keep issuing catchup requests until we've caught up...
          return startCatchUp.call(self);
        })
        .catch(abortError);
    } else {
      log("catchup complete");
      self._catchingUp = false;
      return Promise.resolve();
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
        return startLiveQueue.call(self);
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