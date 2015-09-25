/**
 * Created by toby on 25/09/15.
 */

module.exports = (function() {
  "use strict";

  var AuthAPI = require("nqm-auth-server");
  var _config = require("../config.json");
  var _instance = new AuthAPI();

  function start() {
    return _instance.start(_config.authServer);
  }

  return {
    start: start,
    api: _instance
  };
}())
