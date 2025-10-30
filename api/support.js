// api/support.js  (Vercel Node.js Serverless Function - ESM, Node 20)

// <<< ajuste aqui se quiser usar variável de ambiente >>>
const PRIMARY =
  process.env.N8N_WEBHOOK_URL ||
  "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";

const TIMEOUT_MS = 25000;

function unique(list) {
  return [...new Set(list)];
}

function buildCandidates(url) {
  const withTest = url.replace("/webhook/", "/webhook-test/");
  const hasChat = url.endsWith("/chat");
  const withoutChat = hasChat ? url.replace(/\/chat$/, "") : url;
  const withChat = hasChat ? url : url.replace(/\/$/, "") + "/chat";

  return unique([
    url,
    withTest,
    withoutChat,
    withChat,
    withTest.endsWith("/chat") ? withTest.replace(/\/chat$/, "") : withTest + "/chat",
  ]);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      console.log("[cw-proxy] OPTIONS preflight");
      res.status(204).end();
      return;
    }

    if (req.method === "GET") {
      // health check amigável
      console.log("[cw-proxy] GET health");
      res.status(200).json({
        ok: true,
        info: "Use POST para encaminhar ao n8n",
        node: process.version,
        primary: PRIMARY,
      });
      return;
    }

    if (req.method !== "POST") {
      console.log("[cw-proxy] 405 method=", req.method);
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    // Lê corpo cru SEM depender de parsers externos
    const raw = await readBody(req);
    const size = Buffer.byteLength(raw || "");
    let parsed;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = raw || {};
    }

    console.log("[cw-proxy] IN", {
      method: req.method,
      url: req.url,
      contentType: req.headers["content-type"],
      bytes: size,
      keys: typeof parsed === "object" && parsed ? Object.keys(parsed) : typeof parsed,
    });

    const payload = typeof parsed === "string" ? parsed : JSON.stringify(parsed || {});
    const candidates = buildCandidates(PRIMARY);
    console.log("[cw-proxy] candidates", candidates);

    const tried = [];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort("upstream-timeout"), TIMEOUT_MS);

    for (const url of candidates) {
      try {
        console.log("[cw-proxy] TRY", url);
        const upstream = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "*/*" },
          body: payload,
          signal: ctrl.signal,
        });

        const text = await upstream.text();
        console.log("[cw-proxy] RESP", { url, status: upstream.status, len: text.length, snippet: text.slice(0, 200) });

        res.setHeader("x-cw-proxy-target", url);

        if (![404, 405].includes(upstream.status)) {
          // devolve do jeito que veio
          try {
            const json = JSON.parse(text);
            clearTimeout(t);
            res.status(upstream.status).json(json);
            console.log("[cw-proxy] OK_JSON via", url, "took", Date.now() - startedAt, "ms");
            return;
          } catch {
            clearTimeout(t);
            res.status(upstream.status).send(text);
            console.log("[cw-proxy] OK_TEXT via", url, "took", Date.now() - startedAt, "ms");
            return;
          }
        }

        tried.push({ url, status: upstream.status, body: text.slice(0, 200) });
      } catch (e) {
        const msg = e?.name === "AbortError" ? "AbortError: upstream-timeout" : String(e?.message || e);
        console.error("[cw-proxy] ERR_FETCH", url, msg);
        tried.push({ url, error: msg });
        if (e?.name === "AbortError") break; // estoura geral no timeout
      }
    }

    clearTimeout(t);
    console.error("[cw-proxy] NO_MATCH 502", tried);
    res.status(502).json({
      ok: false,
      error: "Nenhum endpoint do n8n respondeu além de 404/405.",
      hint: "Ative o workflow, confirme método POST e path /chat (ou use /webhook-test/ em modo teste).",
      tried,
      took_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[cw-proxy] FATAL 500", err?.stack || err);
    res.status(500).json({
      ok: false,
      error: "Proxy failure",
      message: String(err?.message || err),
      stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
      took_ms: Date.now() - startedAt,
    });
  }
}
