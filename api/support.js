// api/support.js  (Vercel Node.js Serverless Function - ESM)

// 1) URL principal do seu webhook n8n (pode trocar por env também)
const PRIMARY = process.env.N8N_WEBHOOK_URL
  || "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";

// 2) Helpers
function unique(list) {
  return [...new Set(list)];
}
function buildCandidates(url) {
  const withTest = url.replace("/webhook/", "/webhook-test/");
  const hasChat = url.endsWith("/chat");
  const withoutChat = hasChat ? url.replace(/\/chat$/, "") : url;
  const withChat = hasChat ? url : url.replace(/\/$/, "") + "/chat";

  return unique([
    url,                 // prod (entrada)
    withTest,            // test
    withoutChat,         // prod sem /chat
    withChat,            // prod com /chat
    withTest.endsWith("/chat") ? withTest.replace(/\/chat$/, "") : withTest + "/chat", // test com/sem chat
  ]);
}

// 3) Handler
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Saúde rápida p/ GET (ajuda testar em /api/support)
  if (req.method === "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed", hint: "Use POST" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    // 4) fetch compat (Node 18+ tem fetch global; se não tiver, polyfill)
    const fetchFn = globalThis.fetch ?? (await import("node-fetch")).default;

    // 5) corpo
    const payload =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});

    const candidates = buildCandidates(PRIMARY);
    const tried = [];

    for (const url of candidates) {
      try {
        const upstream = await fetchFn(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "*/*" },
          body: payload,
        });

        const text = await upstream.text();

        // Propaga qual URL respondeu
        res.setHeader("x-cw-proxy-target", url);

        if (![404, 405].includes(upstream.status)) {
          try {
            const json = JSON.parse(text);
            res.status(upstream.status).json(json);
            return;
          } catch {
            res.status(upstream.status).send(text);
            return;
          }
        }

        tried.push({ url, status: upstream.status, body: text.slice(0, 200) });
      } catch (e) {
        tried.push({ url, error: String(e?.message || e) });
      }
    }

    // Se nada funcionou:
    res.status(502).json({
      ok: false,
      error: "Nenhum endpoint do n8n respondeu (404/405).",
      hint: "Ative o workflow, confira o método POST e o path /chat.",
      tried,
    });
  } catch (err) {
    // Erro de inicialização/execução (pega casos de módulo/ambiente)
    res.status(500).json({
      ok: false,
      error: "Proxy failure",
      message: String(err?.message || err),
      stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
    });
  }
}
