// api/ping.cjs
module.exports = (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("x-cw-ping", "ok");
  res.status(200).end(JSON.stringify({
    ok: true,
    ts: new Date().toISOString(),
    node: process.versions?.node || null,
    vercelId: req.headers?.["x-vercel-id"] || null
  }));
};
