// api/support.cjs
// Proxy robusto + CORS para o webhook do n8n, com logs e header X-CW-Proxy-Target.

const PRIMARY = "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";

function unique(list) { return [...new Set(list)]; }
function buildCandidates(url) {
  const withTest = url.replace("/webhook/", "/webhook-test/");
  const hasChat = url.endsWith("/chat");
  const withoutChat = hasChat ? url.replace(/\/chat$/, "") : url;
  const withChat = hasChat ? url : url.replace(/\/$/, "") + "/chat";
  return unique([
    url, withTest, withoutChat, withChat,
    withTest.endsWith("/chat") ? withTest.replace(/\/chat$/, "") : withTest + "/chat",
  ]);
}
function log(id, label, data) {
  try { console.log("[api/support]", id, label, typeof data === "string" ? data : JSON.stringify(data)); }
  catch { console.log("[api/support]", id, label); }
}

module.exports = async (req, res) => {
  const rid = Math.random().toString(36).slice(2);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Debug-Id");
  res.setHeader("X-Debug-Id", rid);

  // Pré-flight
  if (req.method === "OPTIONS") {
    log(rid, "OPTIONS");
    return res.status(204).end();
  }

  // GET de diagnóstico rápido (evita 405 ao abrir a URL no navegador)
  if (req.method === "GET") {
    log(rid, "GET /api/support");
    return res.status(200).json({
      ok: true,
      tip: "Use POST para encaminhar ao n8n.",
      node: process.version,
      region: process.env.VERCEL_REGION || null,
    });
  }

  if (req.method !== "POST") {
    log(rid, "405", req.method);
    return res.status(405).json({ ok: false, error: "Method not allowed", method: req.method });
  }

  const bodyRaw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const candidates = buildCandidates(PRIMARY);
  log(rid, "IN", { method: req.method, candidates });

  const tried = [];
  for (const target of candidates) {
    try {
      const upstream = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "*/*" },
        body: bodyRaw,
      });

      const text = await upstream.text();
      log(rid, "TRY", { target, status: upstream.status, len: text.length });

      if (![404, 405].includes(upstream.status)) {
        res.setHeader("X-CW-Proxy-Target", target);
        try {
          const json = JSON.parse(text);
          log(rid, "OK(JSON)", { target, status: upstream.status });
          return res.status(upstream.status).json(json);
        } catch {
          log(rid, "OK(TEXT)", { target, status: upstream.status });
          return res.status(upstream.status).send(text);
        }
      }
      tried.push({ url: target, status: upstream.status, body: text.slice(0, 200) });
    } catch (e) {
      tried.push({ url: target, error: String(e?.message || e) });
    }
  }

  log(rid, "FAIL", tried);
  return res.status(502).json({
    ok: false,
    error: "Nenhum endpoint do n8n respondeu (404/405).",
    hint: "Confirme se o workflow está ATIVO e aceita POST no path /chat (ou /webhook-test/).",
    tried
  });
};
