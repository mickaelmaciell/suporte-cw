// api/support.js  (Vercel Serverless Function - CommonJS)
// Proxy com fallback inteligente para Webhook do n8n + CORS liberado.

const PRIMARY = "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";

function unique(list) {
  return [...new Set(list)];
}

function buildCandidates(url) {
  const withTest = url.replace("/webhook/", "/webhook-test/");
  const hasChat = url.endsWith("/chat");
  const withoutChat = hasChat ? url.replace(/\/chat$/, "") : url;
  const withChat = hasChat ? url : url.replace(/\/$/, "") + "/chat";

  return unique([
    url,                 // prod + com/sem /chat (entrada)
    withTest,            // test + (igual à entrada)
    withoutChat,         // prod sem /chat
    withChat,            // prod com /chat
    withTest.endsWith("/chat") ? withTest.replace(/\/chat$/, "") : withTest + "/chat", // test com/sem chat
  ]);
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Preflight
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // Corpo a repassar
  const payload =
    typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});

  const candidates = buildCandidates(PRIMARY);
  const errors = [];

  for (const url of candidates) {
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "*/*" },
        body: payload,
      });

      const text = await upstream.text();

      // Se 2xx/3xx/4xx != 404/405, já devolve
      if (![404, 405].includes(upstream.status)) {
        try {
          const json = JSON.parse(text);
          return res.status(upstream.status).json(json);
        } catch {
          return res.status(upstream.status).send(text);
        }
      }

      errors.push({ url, status: upstream.status, body: text.slice(0, 300) });
    } catch (e) {
      errors.push({ url, error: String(e?.message || e) });
    }
  }

  // Se chegou aqui, nada deu certo
  return res.status(502).json({
    error: "Nenhum endpoint do n8n respondeu (404/405).",
    hint: "Verifique se o workflow está ATIVO, o método do Webhook (POST) e o path (/chat).",
    tried: errors,
  });
};
