// api/support.js
// Vercel Node Function (runtime Node 20) com proxy para o n8n + CORS + logs detalhados.

export const config = {
  runtime: "nodejs20.x",
};

const PRIMARY = "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";

// Helpers
function unique(list) {
  return [...new Set(list)];
}
function buildCandidates(url) {
  // tenta variações: /webhook, /webhook-test, com/sem /chat
  const hasChat = url.endsWith("/chat");
  const withoutChat = hasChat ? url.replace(/\/chat$/, "") : url;
  const withChat = hasChat ? url : url.replace(/\/$/, "") + "/chat";
  const testBase = url.replace("/webhook/", "/webhook-test/");

  return unique([
    url,                 // webhook prod (com/sem /chat)
    withChat,            // força com /chat
    withoutChat,         // sem /chat
    testBase,            // webhook-test (igual à entrada)
    testBase.endsWith("/chat") ? testBase.replace(/\/chat$/, "") : testBase + "/chat", // webhook-test com/sem chat
  ]);
}

function json(res, status, body, extraHeaders = {}) {
  const data = typeof body === "string" ? { message: body } : body;
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.status(status).end(JSON.stringify(data));
}

// Handler
export default async function handler(req, res) {
  const rid = (req.headers["x-vercel-id"] || "no-vercel-id") + "::" + Date.now();
  const method = (req.method || "GET").toUpperCase();

  // CORS (libera para qualquer origem)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // OPTIONS (preflight)
  if (method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // GET simples para health/debug (evita 405 e ajuda a testar no navegador)
  if (method === "GET") {
    json(res, 200, {
      ok: true,
      message: "CW Support proxy ativo. Use POST para encaminhar ao n8n.",
      vercelId: req.headers["x-vercel-id"] || null,
      targetPrimary: PRIMARY,
      hint: "Envie POST para /api/support com { sessionId, action:'sendMessage', chatInput }",
    });
    return;
  }

  if (method !== "POST") {
    // Em vez de 405, devolvemos 200 com instrução (para não poluir console)
    json(res, 200, {
      ok: false,
      error: "Use POST para conversar com o bot.",
      hint: "Envie JSON { sessionId, action:'sendMessage', chatInput }",
    });
    return;
  }

  // Tenta ler o corpo como JSON ou string
  let payloadRaw = "";
  try {
    if (typeof req.body === "string") {
      payloadRaw = req.body;
    } else if (req.body && typeof req.body === "object") {
      payloadRaw = JSON.stringify(req.body);
    } else {
      // body-parser pode não ter atuado; tenta stream
      payloadRaw = await new Promise((resolve, reject) => {
        let data = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data || "{}"));
        req.on("error", reject);
      });
    }
  } catch (e) {
    return json(res, 400, { ok: false, error: "Falha ao ler body", detail: String(e) });
  }

  // ALVOs candidatos no n8n
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
        sample: text.slice(0, 300),
      });

      // Se encontrou algo que não seja 404/405, consideramos resposta válida
      if (![404, 405].includes(upstream.status)) {
        // Tenta JSON, senão repassa texto
        try {
          const jsonOut = JSON.parse(text);
          res.setHeader("x-cw-proxy-target", url);
          return json(res, upstream.status, jsonOut);
        } catch {
          res.setHeader("x-cw-proxy-target", url);
          res.status(upstream.status).end(text);
          return;
        }
      }
    } catch (e) {
      attempts.push({ url, error: String(e?.message || e) });
    }
  }

  // Nenhum candidato funcionou
  res.setHeader("x-cw-proxy-target", "none");
  return json(res, 502, {
    ok: false,
    error: "Nenhum endpoint do n8n respondeu corretamente (404/405/erro).",
    vercelId: req.headers["x-vercel-id"] || null,
    tried: attempts,
    hint: "Verifique se o workflow está ATIVO, o Webhook node está como POST e o path termina com /chat.",
  });
}
