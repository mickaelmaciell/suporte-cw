// api/support.cjs
// Vercel Serverless Function (Node 20, CommonJS)
// Proxy para n8n com CORS, health GET e logs ricos.

const PRIMARY = "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";

/* ---------------- helpers ---------------- */
function unique(list) { return [...new Set(list)]; }

function buildCandidates(url) {
  try {
    const hasChat = url.endsWith("/chat");
    const base = hasChat ? url.slice(0, -5) : url.replace(/\/$/, "");
    const testBase = url.replace("/webhook/", "/webhook-test/");
    return unique([
      url,                 // .../webhook/.../chat
      base,                // .../webhook/...
      base + "/chat",      // .../webhook/.../chat (normaliza)
      testBase,            // .../webhook-test/...
      testBase.endsWith("/chat") ? testBase.slice(0, -5) : testBase + "/chat"
    ]);
  } catch {
    return [url];
  }
}

function sendJson(res, status, body, extra = {}) {
  const data = typeof body === "string" ? { message: body } : (body || {});
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra,
  };
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.status(status).end(JSON.stringify(data));
}

async function readRawBody(req) {
  // tenta pegar do body já parseado
  try {
    if (typeof req.body === "string") return req.body;
    if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
    if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  } catch {}
  // fallback: stream
  return await new Promise((resolve, reject) => {
    let data = "";
    try { req.setEncoding && req.setEncoding("utf8"); } catch {}
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data || "{}"));
    req.on("error", reject);
  });
}

/* ---------------- handler ---------------- */
module.exports = async (req, res) => {
  const startedAt = Date.now();
  const method = (req.method || "GET").toUpperCase();
  const vercelId = req.headers["x-vercel-id"] || null;
  const rid = `${vercelId || "no-vercel"}::${startedAt}`;

  // CORS + métodos
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Allow", "POST, GET, OPTIONS");

  if (method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Health GET
  if (method === "GET") {
    sendJson(res, 200, {
      ok: true,
      message: "CW Support proxy ativo. Use POST para conversar com o bot.",
      rid,
      vercelId,
      node: process.versions?.node,
      targetPrimary: PRIMARY,
      candidates: buildCandidates(PRIMARY),
      hint: "POST /api/support com { sessionId, action:'sendMessage', chatInput }",
      ts: new Date().toISOString(),
    });
    return;
  }

  // Força POST para conversar
  if (method !== "POST") {
    sendJson(res, 200, {
      ok: false,
      error: "Use POST para conversar com o bot.",
      rid,
      hint: "Envie JSON { sessionId, action:'sendMessage', chatInput }",
      ts: new Date().toISOString(),
    });
    return;
  }

  try {
    const payloadRaw = await readRawBody(req);
    const bodyLen = (payloadRaw || "").length;

    console.log("[CW][IN]", JSON.stringify({
      rid,
      method,
      bodyLen,
      ct: req.headers["content-type"] || null,
      host: req.headers["host"] || null,
      vercelId,
    }));

    // Sanity check do JSON
    let parsed = {};
    try { parsed = JSON.parse(payloadRaw || "{}"); } catch {}
    if (!parsed || typeof parsed !== "object") parsed = {};
    if (!parsed.chatInput && !parsed.message && !parsed.text) {
      console.warn("[CW][WARN] payload sem chatInput/message/text", { rid, parsedKeys: Object.keys(parsed) });
    }

    const candidates = buildCandidates(PRIMARY);
    const attempts = [];

    for (const url of candidates) {
      try {
        const upstream = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "*/*" },
          body: payloadRaw,
        });

        const text = await upstream.text();

        attempts.push({
          url,
          status: upstream.status,
          ok: upstream.ok,
          len: text.length,
          sample: text.slice(0, 200),
        });

        // Qualquer status != 404/405 a gente devolve "como veio"
        if (![404, 405].includes(upstream.status)) {
          res.setHeader("x-cw-proxy-target", url);
          try {
            const jsonOut = JSON.parse(text);
            console.log("[CW][OUT][OK]", JSON.stringify({ rid, status: upstream.status, url }));
            sendJson(res, upstream.status, jsonOut);
          } catch {
            console.log("[CW][OUT][TEXT]", JSON.stringify({ rid, status: upstream.status, url, len: text.length }));
            res.status(upstream.status).end(text);
          }
          return;
        }
      } catch (e) {
        attempts.push({ url, error: String(e?.message || e) });
      }
    }

    // Nada funcionou
    res.setHeader("x-cw-proxy-target", "none");
    console.error("[CW][PROXY_FAIL]", JSON.stringify({ rid, attempts }));
    sendJson(res, 502, {
      ok: false,
      rid,
      vercelId,
      error: "Nenhum endpoint do n8n respondeu corretamente (404/405/erro).",
      tried: attempts,
      hint: "Verifique se o workflow do n8n está ATIVO, método POST, e o path termina com /chat. Cheque também CORS se for chamar direto do browser.",
      ts: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[CW][HANDLER_FATAL]", {
      rid,
      name: err?.name || null,
      message: err?.message || String(err),
      stack: err?.stack || null,
    });
    res.setHeader("x-cw-proxy-target", "handler-crash");
    sendJson(res, 500, {
      ok: false,
      rid,
      error: "handler_crashed",
      detail: err?.message || String(err),
      ts: new Date().toISOString(),
    });
  } finally {
    console.log("[CW][END]", JSON.stringify({ rid, tookMs: Date.now() - startedAt }));
  }
};
