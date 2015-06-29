/**
 * Created by toby on 28/06/15.
 */

"use strict";

module.exports = (function() {
  var log = require("debug")("DatasetDataProjection");
  var Promise = require("bluebird");
  var eventBus = require("../busClient").EventBus;
  var SyncStatusModel = require("../models/syncStatusModel");
  var _  = require("lodash");

  var processError = function(err) {
    log("****** FAILURE PROCESS EVENT **********: %s", err.message);
    throw err;
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

    // Make sure queue is running.
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

    log("catching up %d events", msg.payload.length);

    return processQueue.call(this, msg.payload)
      .then(function() {
        self._catchingUp = false;
        log("finished catching up - switching to live handler");
        startQueue.call(self);
      })
      .catch(processError);
  };

  function ProjectionQueue() {
    this._key = null;
  }

  ProjectionQueue.prototype.start = function(key) {
    var self = this;
    this._queueRunning = false;
    this._catchingUp = true;
    this._queue = [];
    this._key = key;

    SyncStatusModel.findOneAsync({ model: this._key })
      .then(function(sync) {
        if (sync) {
          eventBus.then(function(eventBus) { eventBus.catchUp(self._key, sync.timestamp, catchUpHandler.bind(self)); });
        } else {
          eventBus.then(function(eventBus) { eventBus.catchUp(self._key, 0, catchUpHandler.bind(self)); });
        }
      });

    // Listen for dataset events.
    return eventBus.then(function(eventBus) { eventBus.subscribe(self._key + ".*", liveHandler.bind(self)) });
  }

  ProjectionQueue.prototype.stop = function() {
    var self = this;
    if (this._catchingUp) {
      // ToDo - investigate.
      log("!!!!!!!!!! attempting to stop projection before catch-up is complete");
      this._catchingUp = this._queueRunning = false;
      this._stopping = true;
    }
    return eventBus.then(function(eventBus) { eventBus.unsubscribe(self._key + ".*", liveHandler.bind(self)); })
  };

  return ProjectionQueue;
}());