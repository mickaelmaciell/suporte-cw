// api/support.js
// Vercel Node Function (Node 20) em CommonJS + proxy p/ n8n + CORS + logs completos.

const PRIMARY = "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";

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
  const data = typeof body === "string" ? { message: body } : body;
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  };
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.status(status).end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  const method = (req.method || "GET").toUpperCase();
  const vercelId = req.headers["x-vercel-id"] || null;
  const rid = `${vercelId || "no-vercel"}::${Date.now()}`;

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Allow", "POST, GET, OPTIONS");

  // Preflight
  if (method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // GET: health/debug (nunca 405 aqui)
  if (method === "GET") {
    sendJson(res, 200, {
      ok: true,
      message: "CW Support proxy ativo. Use POST para encaminhar ao n8n.",
      rid,
      vercelId,
      targetPrimary: PRIMARY,
      hint: "POST /api/support com { sessionId, action:'sendMessage', chatInput }",
    });
    return;
  }

  // Qualquer coisa que não seja POST: responde 200 com instrução
  if (method !== "POST") {
    sendJson(res, 200, {
      ok: false,
      error: "Use POST para conversar com o bot.",
      rid,
      hint: "Envie JSON { sessionId, action:'sendMessage', chatInput }",
    });
    return;
  }

  // Lê body (string/objeto/stream)
  let payloadRaw = "";
  try {
    if (typeof req.body === "string") {
      payloadRaw = req.body;
    } else if (req.body && typeof req.body === "object") {
      payloadRaw = JSON.stringify(req.body);
    } else {
      payloadRaw = await new Promise((resolve, reject) => {
        let data = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data || "{}"));
        req.on("error", reject);
      });
    }
  } catch (e) {
    return sendJson(res, 400, { ok: false, rid, error: "Falha ao ler body", detail: String(e) });
  }

  const attempts = [];
  const candidates = buildCandidates(PRIMARY);

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
        sample: text.slice(0, 300),
      });

      // Se não for 404/405, consideramos OK e repassamos
      if (![404, 405].includes(upstream.status)) {
        res.setHeader("x-cw-proxy-target", url);
        try {
          const jsonOut = JSON.parse(text);
          sendJson(res, upstream.status, jsonOut);
        } catch {
          res.status(upstream.status).end(text);
        }
        return;
      }
    } catch (e) {
      attempts.push({ url, error: String(e?.message || e) });
    }
  }

  res.setHeader("x-cw-proxy-target", "none");
  sendJson(res, 502, {
    ok: false,
    rid,
    vercelId,
    error: "Nenhum endpoint do n8n respondeu corretamente (404/405/erro).",
    tried: attempts,
    hint: "Confirme se o workflow do n8n está ATIVO, método POST e path termina com /chat.",
  });
};

// Declara o runtime para Node 20 no formato CJS
module.exports.config = {
  runtime: "nodejs20.x",
};
