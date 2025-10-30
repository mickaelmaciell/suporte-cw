// api/support.cjs
// Proxy para n8n com CORS, health, diagnóstico e LOGS detalhados.
// Compatível com Vercel Node 20 (CommonJS). Não mude a extensão .cjs.

const DEFAULT_PRIMARY = "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";

// Permite override pelo ambiente, se quiser ajustar sem redeploy
const PRIMARY = process.env.N8N_PRIMARY_URL || DEFAULT_PRIMARY;

// Controle de log: por padrão ligado; defina CW_DEBUG=0 para reduzir verbosidade
const DEBUG = process.env.CW_DEBUG !== "0";

// -------- util/log ----------
function log(...args) { if (DEBUG) console.log(...args); }
function warn(...args) { console.warn(...args); }
function errlog(...args) { console.error(...args); }

function unique(list) { return [...new Set(list)]; }

function buildCandidates(url) {
  try {
    const hasChat = url.endsWith("/chat");
    const base = hasChat ? url.slice(0, -5) : url.replace(/\/$/, "");
    const testBase = url.replace("/webhook/", "/webhook-test/");
    const all = unique([
      url,                 // como veio
      base,                // sem /chat
      base + "/chat",      // com /chat
      testBase,            // webhook-test (sem /chat)
      testBase.endsWith("/chat") ? testBase.slice(0, -5) : testBase + "/chat", // webhook-test com /chat
    ]);
    return all;
  } catch {
    return [url];
  }
}

function mask(str, max = 512) {
  if (str == null) return "";
  const s = String(str);
  return s.length > max ? s.slice(0, max) + `…(+${s.length - max})` : s;
}

function topHeaders(h, n = 12) {
  if (!h) return {};
  const out = {};
  const wanted = [
    "content-type","content-length","accept","user-agent","origin","referer",
    "x-real-ip","x-forwarded-for","x-vercel-id","x-request-id","host","accept-encoding"
  ];
  for (const k of wanted) {
    const v = h[k] || h[k?.toLowerCase?.()];
    if (v) out[k] = v;
  }
  // limita total
  const keys = Object.keys(out).slice(0, n);
  const trimmed = {};
  for (const k of keys) trimmed[k] = out[k];
  return trimmed;
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
  // Tenta os formatos comuns que a Vercel fornece
  try {
    if (typeof req.body === "string") return req.body;
    if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
    if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  } catch {}
  // Fallback p/ stream
  return await new Promise((resolve, reject) => {
    let data = "";
    try { req.setEncoding && req.setEncoding("utf8"); } catch {}
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data || "{}"));
    req.on("error", reject);
  });
}

function getUrlObject(req) {
  try {
    const base = `http://${req.headers.host || "local.test"}`;
    return new URL(req.url || "/", base);
  } catch {
    return new URL("http://local.test/");
  }
}

async function diagCheck(url) {
  const started = Date.now();
  try {
    const ping = { ping: true, ts: new Date().toISOString() };
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ping),
    });
    const ct = r.headers.get("content-type") || "";
    let sample = "";
    try {
      if (ct.includes("json")) {
        sample = JSON.stringify(await r.json()).slice(0, 280);
      } else {
        sample = (await r.text()).slice(0, 280);
      }
    } catch {
      // ignora
    }
    return {
      url, status: r.status, ok: r.ok,
      tookMs: Date.now() - started,
      ct, sample
    };
  } catch (e) {
    return { url, error: String(e?.message || e), tookMs: Date.now() - started };
  }
}

// ------------- Handler -------------
module.exports = async (req, res) => {
  const startedAt = Date.now();
  const method = (req.method || "GET").toUpperCase();
  const vercelId = req.headers["x-vercel-id"] || null;
  const rid = `${vercelId || "no-vercel"}::${startedAt}`;

  // CORS + Allow
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Allow", "POST, GET, OPTIONS");
  res.setHeader("x-cw-rid", rid);

  if (method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const u = getUrlObject(req);
  const isDiag = u.searchParams.has("diag"); // GET /api/support?diag=1

  try {
    if (method === "GET") {
      const candidates = buildCandidates(PRIMARY);
      if (isDiag) {
        // Diagnóstico ativo: testa todos os candidatos e retorna relatório detalhado
        const checks = [];
        for (const url of candidates) {
          const r = await diagCheck(url);
          checks.push(r);
          log("[CW][DIAG]", JSON.stringify({ rid, ...r }));
        }
        sendJson(res, 200, {
          ok: true,
          rid, vercelId,
          node: process.versions?.node,
          mode: "diagnostic",
          primary: PRIMARY,
          candidates,
          results: checks,
          ts: new Date().toISOString(),
        });
        return;
      }

      // Health padrão
      sendJson(res, 200, {
        ok: true,
        message: "CW Support proxy ativo. Use POST para conversar com o bot.",
        rid,
        vercelId,
        node: process.versions?.node,
        primary: PRIMARY,
        candidates: buildCandidates(PRIMARY),
        hint: "POST /api/support com { sessionId, action:'sendMessage', chatInput }",
        ts: new Date().toISOString(),
      });
      return;
    }

    if (method !== "POST") {
      // Nunca 405 – responde instrução
      sendJson(res, 200, {
        ok: false,
        rid,
        error: "Use POST para conversar com o bot.",
        hint: "Envie JSON { sessionId, action:'sendMessage', chatInput }",
        ts: new Date().toISOString(),
      });
      return;
    }

    const payloadRaw = await readRawBody(req);
    const bodyLen = (payloadRaw || "").length;

    // tenta extrair preview do body p/ log (sem imprimir conteúdo inteiro)
    let preview = "";
    try {
      preview = JSON.stringify(JSON.parse(payloadRaw));
    } catch {
      preview = payloadRaw;
    }

    const inMeta = {
      rid, method, bodyLen,
      bodyPreview: mask(preview, 320),
      headers: topHeaders(req.headers),
      vercelId,
      env: {
        node: process.versions?.node,
        cw_debug: process.env.CW_DEBUG || undefined,
        n8n_primary_env: !!process.env.N8N_PRIMARY_URL,
      }
    };
    log("[CW][IN]", JSON.stringify(inMeta));

    const candidates = buildCandidates(PRIMARY);
    log("[CW][CANDIDATES]", JSON.stringify({ rid, total: candidates.length, candidates }));

    const attempts = [];
    const startedProxyAt = Date.now();

    for (const url of candidates) {
      const attemptStart = Date.now();
      try {
        const upstream = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "*/*" },
          body: payloadRaw,
        });

        const ct = upstream.headers.get("content-type") || "";
        let raw = "";
        try {
          raw = await upstream.text();
        } catch (e) {
          raw = "";
        }

        const attempt = {
          url,
          status: upstream.status,
          ok: upstream.ok,
          tookMs: Date.now() - attemptStart,
          ct,
          sample: mask(raw, 280),
        };
        attempts.push(attempt);
        log("[CW][TRY]", JSON.stringify({ rid, ...attempt }));

        // reencaminha qualquer status que não seja 404/405
        if (![404, 405].includes(upstream.status)) {
          res.setHeader("x-cw-proxy-target", url);
          res.setHeader("x-cw-proxy-attempts", String(attempts.length));

          // repassa conteúdo conforme content-type
          if (ct.includes("json")) {
            try {
              const jsonOut = JSON.parse(raw);
              log("[CW][OUT][OK]", JSON.stringify({ rid, status: upstream.status, url }));
              sendJson(res, upstream.status, jsonOut);
              return;
            } catch {
              // JSON quebrado no upstream -> devolve texto cru
            }
          }
          // texto/qualquer
          log("[CW][OUT][TEXT]", JSON.stringify({ rid, status: upstream.status, url, len: raw.length }));
          res.status(upstream.status).end(raw);
          return;
        }
      } catch (e) {
        const attempt = {
          url,
          error: String(e?.message || e),
          tookMs: Date.now() - attemptStart,
        };
        attempts.push(attempt);
        warn("[CW][TRY][ERR]", JSON.stringify({ rid, ...attempt }));
      }
    }

    // Ninguém respondeu (ou só 404/405)
    res.setHeader("x-cw-proxy-target", "none");
    res.setHeader("x-cw-proxy-attempts", String(attempts.length));
    errlog("[CW][PROXY_FAIL]", JSON.stringify({
      rid,
      totalTookMs: Date.now() - startedProxyAt,
      attempts
    }));
    sendJson(res, 502, {
      ok: false,
      rid,
      vercelId,
      error: "Nenhum endpoint do n8n respondeu corretamente (404/405/erro).",
      tried: attempts,
      hint: "Verifique se o workflow do n8n está ATIVO, aceita POST e o path termina com /chat.",
      ts: new Date().toISOString(),
    });

  } catch (error) {
    errlog("[CW][HANDLER_FATAL]", JSON.stringify({
      rid,
      name: error?.name || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
    }));
    res.setHeader("x-cw-proxy-target", "handler-crash");
    sendJson(res, 500, {
      ok: false,
      rid,
      error: "handler_crashed",
      detail: error?.message || String(error),
      ts: new Date().toISOString(),
    });
  } finally {
    log("[CW][END]", JSON.stringify({ rid, tookMs: Date.now() - startedAt }));
  }
};
