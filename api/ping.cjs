// api/ping.js
export const config = { runtime: "edge" };

export default function handler(req) {
  const rid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const h = new Headers({ "content-type": "application/json; charset=utf-8", "x-cw-rid": rid });
  return new Response(JSON.stringify({
    ok: true,
    ts: new Date().toISOString(),
    ua: req.headers.get("user-agent") || null
  }), { status: 200, headers: h });
}
