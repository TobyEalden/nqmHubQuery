/**
 * Created by toby on 21/08/15.
 */

exports.authenticate = (function() {
  "use strict";

  var passport = require("passport");
  var Strategy = require("passport-http-bearer").Strategy;

  passport.use(new Strategy(function(token,cb) {
    var user = { id: 123, username: "toby ealden", token: "xyz" };
    cb(null, user);
  }));

  var doAuthentication = function(req, res, next, callback) {
    var authFunc = passport.authenticate("bearer", function(err, user, info) {
      var uid = req.params.uid;
      if (err) {
        return next(err);
      }
      if (!user) {
        res.statusCode = 401;
        res.contentType = "text/plain";
        res.send("/" + uid + "/authenticate");
        return next();
      }
      return callback(req, res, next);
    });

    return authFunc(req,res,next);
  };

  return doAuthentication;
}());