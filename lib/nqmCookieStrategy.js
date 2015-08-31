/**
 * Created by toby on 31/08/15.
 */

module.exports = (function() {
  var Strategy = require("passport-strategy").Strategy;
  var util = require("util");
  var cookies = require("cookies");

  function CookieStrategy(options, verify) {
    if (typeof options === "function") {
      verify = options;
      options = {};
    }
    if (!verify) {
      throw new TypeError("nqm CookieStrategy requires verify callback");
    }
    Strategy.call(this);

    this.name = "nqmCookie";
    this._verify = verify;
  }

  util.inherits(CookieStrategy, Strategy);

  CookieStrategy.prototype.authenticate = function(req, options) {

  };

  return CookieStrategy;
}());