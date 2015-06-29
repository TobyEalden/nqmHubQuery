/**
 * Created by toby on 27/06/15.
 */

"use strict";

exports.EventBus = (function() {
  var log = require("debug")("busClient");
  var Promise = require("bluebird");
  var EventEmitter = require("eventemitter2").EventEmitter2;
  var util = require("util");
  var net = require("net");
  var config = require("../config.json");
  var split = require("split");

  function BusClient() {
    EventEmitter.call(this, { wildcard: true, delimiter: "." });
    this._config = null;
    this._socket = null;
    this._keyCache = {};
    this._nextId = 0;
    this._callbacks = {};
  }
  util.inherits(BusClient, EventEmitter);

  BusClient.prototype.start = function(config) {
    var self = this;
    return new Promise(function(resolve, reject) {
      self._config = config;
      self._socket = net.createConnection(self._config.port, self._config.host);
      self._socket.on("end", function() {
        log("connection closed - reconnect?");
        self._socket = null;
      });
      self._socket.on("error", function(err) {
        // Todo - reconnection logic...
        log("socket error %s", err.message);
        self._socket = null;
        reject(err);
      });
      self._socket.on("connect", function() { resolve(self); });
      self._socket.pipe(split(JSON.parse))
        .on("data", socketDataHandler.bind(self))
        .on("error", function(err) {
          // ToDo - review
          log("!!!!!!!!!!!! failure parsing socket stream: %s",err.message);
        });
    });
  };

  BusClient.prototype.subscribe = function(key, handler) {
    var self = this;
    return new Promise(function(resolve, reject) {
      if (!self._keyCache.hasOwnProperty(key)) {
        log("subscribing to server");
        self._keyCache[key] = 1;
        var msg = {
          method: "subscribe",
          key: key
        };
        msg.replyId = self._nextId++
        self._callbacks[msg.replyId] = resolve;
        self._socket.write(JSON.stringify(msg) + "\r\n");
      } else {
        log("using cached server subscription");
        self._keyCache[key] = self._keyCache[key] + 1;
        resolve();
      }

      self.on(key, handler);
    });
  };

  BusClient.prototype.unsubscribe = function(key, handler) {
    this.removeListener(key, handler);
    this._keyCache[key] = this._keyCache[key] - 1;
    if (this._keyCache[key] === 0) {
      delete this._keyCache[key];
      var msg = {
        method: "unsubscribe",
        key: key
      };
      this._socket.write(JSON.stringify(msg) + "\r\n");
    }
  };

  BusClient.prototype.catchUp = function(key, since, cb) {
    this._callbacks[this._nextId] = cb;
    var msg = {
      method: "catchup",
      key: key,
      since: since,
      replyId: this._nextId++
    };
    this._socket.write(JSON.stringify(msg) + "\r\n");
  };

  var socketDataHandler = function(msg) {
    log("received data %j", msg);

    switch (msg.method) {
      case "ack":
        if (this._callbacks.hasOwnProperty(msg.replyId)) {
          try {
            this._callbacks[msg.replyId](msg);
          } catch (e) {
            log("failure calling back to %d [%s]",msg.replyId, e.message);
          }
          delete this._callbacks[msg.replyId];
        }
        break;
      case "consume":
        this.emit(msg.key, msg.data);
        break;
      default:
        break;
    }
  };

  var eventBus = new BusClient();
  return eventBus.start(config.eventBus);
}());