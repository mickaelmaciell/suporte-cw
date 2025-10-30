// api/support.cjs
// Proxy p/ n8n com CORS, health, diag e LOGS detalhados.
// Vercel Node.js 20 (CommonJS). Mantenha a extensão .cjs.

const DEFAULT_PRIMARY = "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";
const PRIMARY = process.env.N8N_PRIMARY_URL || DEFAULT_PRIMARY;
const DEBUG = process.env.CW_DEBUG !== "0";

// ---------- utils ----------
function log(...a){ if (DEBUG) console.log(...a); }
function warn(...a){ console.warn(...a); }
function errlog(...a){ console.error(...a); }

function unique(list){ return [...new Set(list)]; }

function buildCandidates(url){
  try{
    const hasChat = url.endsWith("/chat");
    const base = hasChat ? url.slice(0, -5) : url.replace(/\/$/, "");
    const testBase = url.replace("/webhook/", "/webhook-test/");
    return unique([
      url,                 // como veio
      base,                // sem /chat
      base + "/chat",      // com /chat
      testBase,            // webhook-test (sem /chat)
      testBase.endsWith("/chat") ? testBase.slice(0, -5) : testBase + "/chat", // webhook-test com /chat
    ]);
  }catch{ return [url]; }
}

function mask(str, max=512){
  if (str == null) return "";
  const s = String(str);
  return s.length > max ? s.slice(0,max)+`…(+${s.length-max})` : s;
}

function topHeaders(h){
  if (!h) return {};
  const keys = [
    "content-type","content-length","accept","user-agent","origin","referer",
    "x-real-ip","x-forwarded-for","x-vercel-id","x-request-id","host","accept-encoding"
  ];
  const out = {};
  for (const k of keys){
    const v = h[k] ?? h[k?.toLowerCase?.()];
    if (v) out[k] = v;
  }
  return out;
}

function sendJson(res, status, body, extra = {}){
  const data = typeof body === "string" ? { message: body } : (body || {});
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra,
  };
  for (const [k,v] of Object.entries(headers)) res.setHeader(k, v);
  res.status(status).end(JSON.stringify(data));
}

async function readRawBody(req){
  try{
    if (typeof req.body === "string") return req.body;
    if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
    if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  }catch{}
  return await new Promise((resolve, reject) => {
    let data = "";
    try{ req.setEncoding && req.setEncoding("utf8"); }catch{}
    req.on("data", (c)=> data += c);
    req.on("end", ()=> resolve(data || "{}"));
    req.on("error", reject);
  });
}

function urlOfReq(req){
  try{
    const base = `http://${req.headers?.host || "local.test"}`;
    return new URL(req.url || "/", base);
  }catch{
    return new URL("http://local.test/");
  }
}

async function diagCheck(url){
  const started = Date.now();
  try{
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ping:true, ts: new Date().toISOString() })
    });
    const ct = r.headers.get("content-type") || "";
    let sample = "";
    try{
      sample = ct.includes("json") ? JSON.stringify(await r.json()).slice(0,280) : (await r.text()).slice(0,280);
    }catch{}
    return { url, status: r.status, ok: r.ok, tookMs: Date.now()-started, ct, sample };
  }catch(e){
    return { url, error: String(e?.message || e), tookMs: Date.now()-started };
  }
}

// ---------- handler ----------
module.exports = async (req, res) => {
  const startedAt = Date.now();
  const method = (req.method || "GET").toUpperCase();
  const vercelId = req.headers?.["x-vercel-id"] || null;
  const rid = `${vercelId || "no-vercel"}::${startedAt}`;

  // CORS + Allow + header inicial de debug
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Allow", "POST, GET, OPTIONS");
  res.setHeader("x-cw-rid", rid);
  res.setHeader("x-cw-proxy-target", "init");

  if (method === "OPTIONS"){ res.status(204).end(); return; }

  const u = urlOfReq(req);
  const isDiag = u.searchParams.has("diag");

  try{
    if (method === "GET"){
      const candidates = buildCandidates(PRIMARY);
      if (isDiag){
        const results = [];
        for (const url of candidates){
          const r = await diagCheck(url);
          log("[CW][DIAG]", JSON.stringify({ rid, ...r }));
          results.push(r);
        }
        sendJson(res, 200, {
          ok: true, rid, vercelId,
          node: process.versions?.node,
          mode: "diagnostic",
          primary: PRIMARY,
          candidates,
          results,
          ts: new Date().toISOString(),
        });
        return;
      }
      // Health
      sendJson(res, 200, {
        ok: true,
        message: "CW Support proxy ativo. Use POST para conversar com o bot.",
        rid, vercelId,
        node: process.versions?.node,
        primary: PRIMARY,
        candidates: buildCandidates(PRIMARY),
        hint: "POST /api/support com { sessionId, action:'sendMessage', chatInput }",
        ts: new Date().toISOString(),
      });
      return;
    }

    if (method !== "POST"){
      sendJson(res, 200, {
        ok: false, rid,
        error: "Use POST para conversar com o bot.",
        hint: "Envie JSON { sessionId, action:'sendMessage', chatInput }",
        ts: new Date().toISOString(),
      });
      return;
    }

    const payloadRaw = await readRawBody(req);
    const bodyLen = (payloadRaw || "").length;
    let bodyPreview = "";
    try{ bodyPreview = JSON.stringify(JSON.parse(payloadRaw)); }catch{ bodyPreview = payloadRaw; }

    log("[CW][IN]", JSON.stringify({
      rid, method, bodyLen,
      bodyPreview: mask(bodyPreview, 320),
      headers: topHeaders(req.headers),
      env: { node: process.versions?.node, cw_debug: process.env.CW_DEBUG || undefined, n8n_primary_env: !!process.env.N8N_PRIMARY_URL }
    }));

    const candidates = buildCandidates(PRIMARY);
    log("[CW][CANDIDATES]", JSON.stringify({ rid, total: candidates.length, candidates }));

    const attempts = [];
    const startedProxyAt = Date.now();

    for (const url of candidates){
      const attemptStart = Date.now();
      try{
        const upstream = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "*/*" },
          body: payloadRaw,
        });
        const ct = upstream.headers.get("content-type") || "";
        let raw = "";
        try{ raw = await upstream.text(); }catch{ raw = ""; }

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

        if (![404,405].includes(upstream.status)){
          res.setHeader("x-cw-proxy-target", url);
          res.setHeader("x-cw-proxy-attempts", String(attempts.length));

          if (ct.includes("json")){
            try{
              const jsonOut = JSON.parse(raw);
              log("[CW][OUT][OK]", JSON.stringify({ rid, status: upstream.status, url }));
              sendJson(res, upstream.status, jsonOut);
              return;
            }catch{/* cai para texto */}
          }
          log("[CW][OUT][TEXT]", JSON.stringify({ rid, status: upstream.status, url, len: raw.length }));
          res.status(upstream.status).end(raw);
          return;
        }
      }catch(e){
        const attempt = { url, error: String(e?.message || e), tookMs: Date.now()-attemptStart };
        attempts.push(attempt);
        warn("[CW][TRY][ERR]", JSON.stringify({ rid, ...attempt }));
      }
    }

    // só 404/405/erros
    res.setHeader("x-cw-proxy-target", "none");
    res.setHeader("x-cw-proxy-attempts", String(attempts.length));
    errlog("[CW][PROXY_FAIL]", JSON.stringify({ rid, totalTookMs: Date.now()-startedProxyAt, attempts }));

    sendJson(res, 502, {
      ok: false, rid, vercelId,
      error: "Nenhum endpoint do n8n respondeu corretamente (404/405/erro).",
      tried: attempts,
      hint: "Confirme workflow ATIVO, método POST e path terminando com /chat.",
      ts: new Date().toISOString(),
    });

  }catch(error){
    res.setHeader("x-cw-proxy-target", "handler-crash");
    errlog("[CW][HANDLER_FATAL]", JSON.stringify({
      rid,
      name: error?.name || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
    }));
    sendJson(res, 500, {
      ok: false, rid,
      error: "handler_crashed",
      detail: error?.message || String(error),
      ts: new Date().toISOString(),
    });
  }finally{
    log("[CW][END]", JSON.stringify({ rid, tookMs: Date.now()-startedAt }));
  }
};
