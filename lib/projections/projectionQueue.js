/**
 * Created by toby on 28/06/15.
 */

module.exports = (function() {
  "use strict";

  var log = require("debug")("nqmQuery:ProjectionQueue");
  var errLog = require("debug")("nqmQuery:ProjectionQueue:error");
  var Promise = require("bluebird");
  var eventBus = require("../eventBusClient");
  var SyncStatusModel = require("../models/syncStatusModel");

  var abortError = function(err) {
    errLog("ABORTING - event handling failure: %s", err ? err.message : "no error given");

    // Failure to process an event is fatal, as continuing will mean we are
    // out of sync.
    process.exit();
  };

  var setSyncTimestamp = function(model, t) {
    if (t) {
      log("saving sync timestamp for %s [%s]", model, t);
      return SyncStatusModel.findOneAndUpdateAsync({ model: model }, { timestamp: t }, { upsert: true });
    } else {
      return Promise.reject(new Error(util.format("attempt to save null timestamp for sync of %s",model)));
    }
  };

  var processQueue = function(queue) {
    var self = this;

    log("processing queue");
    // Use reduce to process each event sequentially.
    return Promise.reduce(queue, function(acc, nextEvent, index, queueLength) {
        var syncId = nextEvent._id;
        return self.onEvent(nextEvent)
          .then(function() { return setSyncTimestamp(self._key, syncId); })
          .then(function() { return acc+1; });
      }, 0);
  };

  var startLiveQueue = function() {
    var self = this;

    // Make sure queue is running.
    if (!this._queueRunning) {
      self._queueRunning = true;
      return processQueue.call(self, self._queue)
        .then(function(processed) {
          self._queueRunning = false;
          self._queue.splice(0,processed);
          log("finished processing queue - %d items remaining", self._queue.length);
          if (self._queue.length > 0) {
            // This means that events were received while the queue was being
            // processed - retrigger on the next available event loop.
            process.nextTick(startLiveQueue.bind(self));
          }
        })
        .catch(abortError);
    } else {
      log("ignoring startQueue - queue already running");
      return Promise.resolve();
    }
  };

  var liveHandler = function(data) {
    // Add to queue.
    this._queue.push(data);

    if (this._catchingUp) {
      // Do nothing until caught up.
      log("%s - queued event received during catch-up %j",data.__event, data);
    } else {
      startLiveQueue.call(this).catch(abortError);
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
      log("received %d events during catchup",self._queue.length);
      self._catchingUp = false;
      return Promise.resolve();
    }
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
    this._eventListener = liveHandler.bind(this);
    eventBus.subscribe(self._key + ".*", this._eventListener);

    return startCatchUp.call(self)
      .then(function() {
        log("finished catching up %s - switching to live handler", self._key);
        return startLiveQueue.call(self);
      });
  };

  ProjectionQueue.prototype.stop = function() {
    if (this._catchingUp) {
      // ToDo - investigate.
      errLog("!!!!!!!!!! attempting to stop projection before catch-up is complete");
      this._catchingUp = false;
    }
    this._queueRunning = false;
    this._stopping = true;
    if (this._eventListener) {
      return eventBus.unsubscribe(this._key + ".*", this._eventListener);
    }
    this._eventListener = null;
  };

  ProjectionQueue.prototype.isCatchingUp = function() {
    return this._catchingUp;
  };

  return ProjectionQueue;
}());
