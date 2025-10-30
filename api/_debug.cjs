// api/_debug.js  (CommonJS)
"use strict";

module.exports = async (req, res) => {
  res.status(200).json({
    ok: true,
    method: req.method,
    node: process.version,
    vercel_env: process.env.VERCEL_ENV || null,
    url: req.url,
    now: new Date().toISOString()
  });
};
