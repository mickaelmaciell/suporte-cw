// api/_debug.cjs
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    ok: true,
    ts: Date.now(),
    method: req.method,
    url: req.url,
    node: process.version,
    vercel: {
      region: process.env.VERCEL_REGION,
      url: process.env.VERCEL_URL,
      env: process.env.VERCEL_ENV
    }
  });
};
