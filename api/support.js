// api/support.js
// Proxy p/ n8n no Edge Runtime (estável no Vercel) com CORS, health, diag e LOGS.
// Apague qualquer api/support.cjs antigo para evitar conflito.

export const config = { runtime: "edge" };

const DEFAULT_PRIMARY = "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";
const PRIMARY = (typeof process !== "undefined" && process.env?.N8N_PRIMARY_URL) || DEFAULT_PRIMARY;
const DEBUG  = !process?.env?.CW_DEBUG || process.env.CW_DEBUG !== "0";

function log(...a){ if (DEBUG) console.log(...a); }
function warn(...a){ console.warn(...a); }
function errlog(...a){ console.error(...a); }

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  };
}
function json(data, status = 200, extra = {}) {
  const h = new Headers({ "content-type": "application/json; charset=utf-8", ...corsHeaders(), ...extra });
  return new Response(JSON.stringify(data), { status, headers: h });
}
function mask(s, max = 320) {
  if (s == null) return "";
  const str = String(s);
  return str.length > max ? str.slice(0, max) + `…(+${str.length - max})` : str;
}
function buildCandidates(url) {
  try {
    const hasChat = url.endsWith("/chat");
    const base    = hasChat ? url.slice(0, -5) : url.replace(/\/$/, "");
    const test    = url.replace("/webhook/", "/webhook-test/");
    return Array.from(new Set([
      url,
      base,
      base + "/chat",
      test,
      test.endsWith("/chat") ? test.slice(0, -5) : test + "/chat",
    ]));
  } catch {
    return [url];
  }
}
async function diagCheck(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ping: true, ts: new Date().toISOString() }),
    });
    const ct = r.headers.get("content-type") || "";
    const body = await r.text();
    return { url, status: r.status, ok: r.ok, ct, tookMs: Date.now() - t0, sample: mask(body, 280) };
  } catch (e) {
    return { url, error: String(e?.message || e), tookMs: Date.now() - t0 };
  }
}

export default async function handler(req) {
  const t0 = Date.now();
  const rid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const url = new URL(req.url);

  // Pré-headers básicos (serão aplicados nas respostas)
  const baseHeaders = { ...corsHeaders(), "x-cw-rid": rid };

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  try {
    if (req.method === "GET") {
      const candidates = buildCandidates(PRIMARY);

      // /api/support?diag=1 -> testa upstreams
      if (url.searchParams.has("diag")) {
        const results = [];
        for (const c of candidates) {
          const r = await diagCheck(c);
          log("[EDGE][DIAG]", JSON.stringify({ rid, ...r }));
          results.push(r);
        }
        return json(
          {
            ok: true,
            mode: "diagnostic",
            rid,
            primary: PRIMARY,
            candidates,
            results,
            ts: new Date().toISOString(),
          },
          200,
          { ...baseHeaders, "x-cw-proxy-target": "diag" }
        );
      }

      // Health
      return json(
        {
          ok: true,
          message: "CW Support proxy (Edge) ativo. Use POST para conversar com o bot.",
          rid,
          primary: PRIMARY,
          candidates,
          hint: "POST /api/support com { sessionId, action:'sendMessage', chatInput }",
          ts: new Date().toISOString(),
        },
        200,
        { ...baseHeaders, "x-cw-proxy-target": "health" }
      );
    }

    if (req.method !== "POST") {
      return json(
        { ok: false, rid, error: "Use POST para conversar com o bot.", hint: "Envie JSON { sessionId, action:'sendMessage', chatInput }", ts: new Date().toISOString() },
        200,
        { ...baseHeaders, "x-cw-proxy-target": "wrong-method" }
      );
    }

    // Lê o corpo uma única vez (Edge: body é stream)
    const bodyText = await req.text();
    const bodyLen  = (bodyText || "").length;

    log("[EDGE][IN]", JSON.stringify({
      rid,
      method: req.method,
      bodyLen,
      bodyPreview: mask(bodyText, 320),
      ua: req.headers.get("user-agent") || null,
      origin: req.headers.get("origin") || null,
      referer: req.headers.get("referer") || null,
    }));

    const candidates = buildCandidates(PRIMARY);
    log("[EDGE][CANDIDATES]", JSON.stringify({ rid, total: candidates.length, candidates }));

    // Tenta upstreams até achar um que não devolva 404/405
    for (const target of candidates) {
      const tTry = Date.now();
      try {
        const upstream = await fetch(target, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "*/*" },
          body: bodyText,
        });
        const ct = upstream.headers.get("content-type") || "";
        const raw = await upstream.text();

        const tryInfo = { url: target, status: upstream.status, ok: upstream.ok, tookMs: Date.now() - tTry, ct, sample: mask(raw, 200) };
        log("[EDGE][TRY]", JSON.stringify({ rid, ...tryInfo }));

        if (![404, 405].includes(upstream.status)) {
          // Repassa resposta do n8n
          const h = new Headers({ ...baseHeaders, "x-cw-proxy-target": target });
          if (ct.includes("json")) {
            try {
              const parsed = JSON.parse(raw);
              log("[EDGE][OUT][OK]", JSON.stringify({ rid, status: upstream.status, target }));
              return new Response(JSON.stringify(parsed), { status: upstream.status, headers: h });
            } catch {
              // cai para texto
            }
          }
          log("[EDGE][OUT][TEXT]", JSON.stringify({ rid, status: upstream.status, target, len: raw.length }));
          h.set("content-type", ct || "text/plain; charset=utf-8");
          return new Response(raw, { status: upstream.status, headers: h });
        }
      } catch (e) {
        warn("[EDGE][TRY][ERR]", JSON.stringify({ rid, url: target, error: String(e?.message || e) }));
      }
    }

    // Nenhum upstream utilizável
    errlog("[EDGE][PROXY_FAIL]", JSON.stringify({ rid, tookMs: Date.now() - t0, primary: PRIMARY }));
    return json(
      {
        ok: false,
        rid,
        error: "Nenhum endpoint do n8n respondeu corretamente (404/405/erro).",
        hint: "Confirme que o workflow está ATIVO, método POST e path termina com /chat.",
        ts: new Date().toISOString(),
      },
      502,
      { ...baseHeaders, "x-cw-proxy-target": "none" }
    );
  } catch (error) {
    errlog("[EDGE][FATAL]", JSON.stringify({ rid, name: error?.name || null, message: error?.message || String(error) }));
    return json(
      { ok: false, rid, error: "handler_crashed", detail: error?.message || String(error), ts: new Date().toISOString() },
      500,
      { ...baseHeaders, "x-cw-proxy-target": "handler-crash" }
    );
  } finally {
    log("[EDGE][END]", JSON.stringify({ rid, tookMs: Date.now() - t0 }));
  }
}
