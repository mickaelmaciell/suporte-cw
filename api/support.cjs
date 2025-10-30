// api/support.cjs
// Proxy robusto + CORS para o seu webhook do n8n.
// Logs visíveis no "Functions / Logs" da Vercel.

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

// Log helper
function log(...args) {
  console.log("[api/support]", ...args);
}

module.exports = async (req, res) => {
  const rid = Math.random().toString(36).slice(2);
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Debug-Id");
  res.setHeader("X-Debug-Id", rid);

  if (req.method === "OPTIONS") {
    log(rid, "OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    log(rid, "405 Method:", req.method);
    return res.status(405).json({ ok: false, error: "Method not allowed", method: req.method });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const bodyRaw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const candidates = buildCandidates(PRIMARY);
  log(rid, "IN", { path: url.pathname, candidates });

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

      // retorna tudo, exceto 404/405 (vamos tentar o próximo)
      if (![404, 405].includes(upstream.status)) {
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
