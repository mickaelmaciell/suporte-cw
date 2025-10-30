// api/support.js
// Vercel Node Function (Node 20) em CommonJS + proxy para n8n com CORS, health e logs robustos.

const PRIMARY = "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";

/* ====================== helpers ====================== */
function unique(list) {
  return [...new Set(list)];
}

function buildCandidates(url) {
  const hasChat = url.endsWith("/chat");
  const withoutChat = hasChat ? url.replace(/\/chat$/, "") : url;
  const withChat = hasChat ? url : url.replace(/\/$/, "") + "/chat";
  const testBase = url.replace("/webhook/", "/webhook-test/");

  return unique([
    url,                 // webhook prod
    withChat,            // força com /chat
    withoutChat,         // sem /chat
    testBase,            // webhook-test
    testBase.endsWith("/chat") ? testBase.replace(/\/chat$/, "") : testBase + "/chat",
  ]);
}

function sendJson(res, status, body, extraHeaders = {}) {
  const data = typeof body === "string" ? { message: body } : (body || {});
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  };
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.status(status).end(JSON.stringify(data));
}

async function readRawBody(req) {
  // Trata string, Buffer, objeto e stream
  try {
    if (typeof req.body === "string") return req.body;
    if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
    if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  } catch (e) {
    // segue para leitura via stream
  }

  if (req.readable) {
    return await new Promise((resolve, reject) => {
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data || "{}"));
      req.on("error", reject);
    });
  }
  return "{}";
}

/* ====================== handler ====================== */
module.exports = async (req, res) => {
  const startedAt = Date.now();
  const method = (req.method || "GET").toUpperCase();

  // Meta p/ debug
  const vercelId = req.headers["x-vercel-id"] || null;
  const rid = `${vercelId || "no-vercel"}::${startedAt}`;

  // CORS sempre
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Allow", "POST, GET, OPTIONS");

  // Preflight
  if (method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    // Health/Debug
    if (method === "GET") {
      sendJson(res, 200, {
        ok: true,
        message: "CW Support proxy ativo. Use POST para conversar com o bot.",
        rid,
        vercelId,
        targetPrimary: PRIMARY,
        hint: "POST /api/support com { sessionId, action:'sendMessage', chatInput }",
        ts: new Date().toISOString(),
      });
      return;
    }

    // Qualquer método diferente de POST -> orientação (evita 405)
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

    // Lê o body de forma segura
    const payloadRaw = await readRawBody(req);
    const bodyLen = (payloadRaw || "").length;

    // Log de entrada essencial (não vaza dados sensíveis)
    console.log("[CW][IN]", JSON.stringify({
      rid, method, bodyLen,
      ct: req.headers["content-type"] || null,
      host: req.headers["host"] || null,
      vercelId,
    }));

    // Tenta os endpoints candidatos do n8n
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
          sample: text.slice(0, 200),
        });

        // sucesso parcial/total: qualquer coisa que não seja 404/405 a gente repassa
        if (![404, 405].includes(upstream.status)) {
          res.setHeader("x-cw-proxy-target", url);

          // tenta JSON primeiro
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

    // Nenhuma tentativa vingou
    res.setHeader("x-cw-proxy-target", "none");
    console.error("[CW][PROXY_FAIL]", JSON.stringify({ rid, attempts }));
    sendJson(res, 502, {
      ok: false,
      rid,
      vercelId,
      error: "Nenhum endpoint do n8n respondeu corretamente (404/405/erro).",
      tried: attempts,
      hint: "Confirme se o workflow do n8n está ATIVO, método POST e path termina com /chat.",
      ts: new Date().toISOString(),
    });

  } catch (err) {
    // Crash real (erro 500)
    console.error("[CW][HANDLER_FATAL]", {
      rid,
      name: err?.name || null,
      message: err?.message || String(err),
      stack: err?.stack || null,
    });
    // Não setamos x-cw-proxy-target aqui porque nem chegamos a proxyar
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

// Declara o runtime para Node 20 no formato CJS
module.exports.config = {
  runtime: "nodejs20.x",
};
