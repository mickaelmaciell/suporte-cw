// src/components/ChatWidget/index.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Message from "./Message";
import SourceList from "./SourceList";

/* =========================== CONFIG =========================== */

const WELCOME =
  "Olá! Sou o assistente do suporte. Me diga seu problema (ex.: QZ Tray ícone vermelho, não imprime).";

// Sempre absoluto para evitar problemas com basename de SPA
const DEFAULT_ENDPOINT = "/api/support";

// Fallback direto no n8n (precisa estar com CORS permitido no n8n)
const N8N_FALLBACK_URL =
  "https://suportecw.app.n8n.cloud/webhook/3ac05e0c-46f7-475c-989b-708f800f4abf/chat";
const ENABLE_N8N_FALLBACK = true;

const DEBUG = true;
const SHOW_CITATIONS = false;
const RATE_LIMIT_MS = 700; // throttle contra duplo clique
const TIMEOUT_MS = 30000;  // timeout de rede

/* =========================== UTILS =========================== */

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function parseSmart(res) {
  const clone = res.clone();
  try {
    return await clone.json();
  } catch {
    return await res.text();
  }
}

function unwrap(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.length === 1 ? unwrap(obj[0]) : obj;
  if ("json"   in obj && typeof obj.json   === "object") return unwrap(obj.json);
  if ("data"   in obj && typeof obj.data   === "object") return unwrap(obj.data);
  if ("output" in obj && typeof obj.output === "object") return unwrap(obj.output);
  if ("body"   in obj && typeof obj.body   === "object") return unwrap(obj.body);
  return obj;
}

function extractAnswer(payload) {
  const p = unwrap(payload);
  if (typeof p === "string") return p;
  return (
    p?.answer ??
    p?.message ??
    p?.text ??
    p?.choices?.[0]?.message?.content ??
    "Não consegui gerar uma resposta."
  );
}

function extractCitations(payload) {
  const p = unwrap(payload);
  return Array.isArray(p?.citations) ? p.citations : p?.sources ?? [];
}

/* =========================== WIDGET =========================== */

export default function ChatWidget({
  endpoint = DEFAULT_ENDPOINT,
  title = "CW • Suporte",
  accent = "from-[#A543FB] to-[#7e22ce]",
  startOpen = false,
  embed = false,
}) {
  // Sessão efêmera: nova a cada montagem (não usa localStorage)
  const sessionId = useMemo(() => `ephemeral-${genId()}`, []);

  // Estado da UI
  const [open, setOpen] = useState(embed ? true : startOpen);
  const [messages, setMessages] = useState([
    { id: genId(), role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  // Saúde do proxy (checamos GET /api/support)
  const [proxyHealthy, setProxyHealthy] = useState(null); // null=desconhecido, true=ok, false=down

  // Infra
  const listRef = useRef(null);
  const lastSendRef = useRef(0);

  /* ====================== EFFECTS / LOGS ====================== */

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Online/Offline
  useEffect(() => {
    function onOnline() { setOnline(true);  DEBUG && console.info("[WIDGET] navigator online"); }
    function onOffline(){ setOnline(false); DEBUG && console.warn("[WIDGET] navigator offline"); }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Health check do proxy ao montar
  useEffect(() => {
    const resolved = new URL(endpoint, window.location.origin).href;
    DEBUG && console.log("[WIDGET] mount", { endpoint, resolved, sessionId });

    (async () => {
      try {
        const res = await fetch(endpoint, { method: "GET" });
        const txt = await res.text().catch(() => "");
        const xTarget = res.headers?.get?.("x-cw-proxy-target");
        const healthy = res.ok;
        setProxyHealthy(healthy);
        DEBUG && console.log("[WIDGET][HEALTH]", {
          status: res.status,
          ok: res.ok,
          "x-cw-proxy-target": xTarget,
          sample: txt.slice(0, 160),
        });
      } catch (e) {
        setProxyHealthy(false);
        console.error("[WIDGET][HEALTH][ERR]", e);
      }
    })();
  }, [endpoint, sessionId]);

  /* ====================== HANDLERS ====================== */

  function resetChat() {
    setMessages([{ id: genId(), role: "assistant", content: WELCOME }]);
    setError("");
    DEBUG && console.log("[WIDGET] chat resetado (sessão permanece efêmera)", { sessionId });
  }

  async function postJson(url, json, signal) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(json),
      signal,
    });
    const out = await parseSmart(res);
    return { res, out };
  }

  async function send() {
    const now = Date.now();
    if (now - lastSendRef.current < RATE_LIMIT_MS) return; // throttle
    lastSendRef.current = now;

    const text = input.trim();
    if (!text || sending) return;
    if (!online) {
      setError("Você está offline. Verifique sua conexão.");
      return;
    }

    setError("");
    setInput("");

    const userMsg = { id: genId(), role: "user", content: text };
    const pendingId = genId();

    setMessages((m) => [
      ...m,
      userMsg,
      { id: pendingId, role: "assistant", content: "Pensando...", pending: true },
    ]);

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort("timeout"), TIMEOUT_MS);

    try {
      setSending(true);

      const resolved = new URL(endpoint, window.location.origin).href;
      DEBUG && console.log("[WIDGET] POST >>", {
        endpoint,
        resolved,
        sessionId,
        body: { action: "sendMessage", chatInput: text },
        proxyHealthy,
      });

      // 1) Tenta o proxy
      let { res, out } = await postJson(
        endpoint,
        { sessionId, action: "sendMessage", chatInput: text },
        ctrl.signal
      );

      const proxyTarget = res.headers?.get?.("x-cw-proxy-target");
      DEBUG && console.log("[WIDGET][PROXY][RESP]", {
        status: res.status,
        ok: res.ok,
        "x-cw-proxy-target": proxyTarget,
        bodyType: typeof out,
        sample: typeof out === "string" ? out.slice(0, 160) : JSON.stringify(out).slice(0, 160),
      });

      // 2) Se o proxy falhar, tenta fallback no n8n (quando habilitado)
      if (!res.ok && ENABLE_N8N_FALLBACK) {
        console.warn("[WIDGET] Proxy falhou, tentando fallback direto no N8N…");
        ({ res, out } = await postJson(
          N8N_FALLBACK_URL,
          { sessionId, action: "sendMessage", chatInput: text },
          ctrl.signal
        ));
        DEBUG && console.log("[WIDGET][FALLBACK][RESP]", {
          status: res.status,
          ok: res.ok,
          bodyType: typeof out,
          sample: typeof out === "string" ? out.slice(0, 160) : JSON.stringify(out).slice(0, 160),
        });
      }

      if (!res.ok) {
        const hint = res.status === 405
          ? " (verifique se /api/support está absoluto e acessível)"
          : "";
        throw new Error(
          (typeof out === "object" && out?.error) || `Erro ${res.status}${hint}`
        );
      }

      const answer = extractAnswer(out);
      const citations = extractCitations(out);

      setMessages((m) =>
        m
          .filter((msg) => msg.id !== pendingId)
          .concat([
            {
              id: genId(),
              role: "assistant",
              content: answer,
              ...(SHOW_CITATIONS ? { citations } : {}),
            },
          ])
      );
    } catch (e) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === pendingId
            ? {
                ...msg,
                pending: false,
                content:
                  e?.name === "AbortError"
                    ? "Tempo de resposta excedido. Tente novamente."
                    : "Ops, não consegui falar com o servidor agora. Tente novamente.",
              }
            : msg
        )
      );
      setError(
        e?.name === "AbortError"
          ? "Tempo de resposta excedido."
          : e?.message || "Falha ao enviar"
      );
      console.error("[WIDGET][ERROR]", e);
    } finally {
      clearTimeout(to);
      setSending(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  /* ====================== RENDER ====================== */

  const headerEl = (
    <div className={`relative bg-gradient-to-br ${accent} px-5 py-4 text-white rounded-t-2xl`}>
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-[0.8rem]">
            CW
          </div>
          <div className="leading-tight">
            <h3 className="text-base font-bold text-white">{title}</h3>
            <p className="text-[11px] text-white/80 flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${online ? "bg-green-400" : "bg-rose-400"}`} />
              {online ? "Online • Responde em segundos" : "Offline • Sem conexão"}
            </p>
          </div>
        </div>

        {!embed && (
          <div className="flex items-center gap-2">
            <button
              onClick={resetChat}
              className="rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1.5 text-[11px] transition-all"
              title="Nova conversa"
            >
              🔄 Limpar
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg bg-white/15 hover:bg-white/25 p-2 transition-all"
              title="Fechar"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Banner informativo do health/fallback */}
      {proxyHealthy === false && (
        <div className="mt-2 text-[11px] bg-black/15 rounded px-2 py-1">
          Proxy indisponível. Vou tentar enviar direto ao n8n (fallback).
        </div>
      )}
    </div>
  );

  const messagesEl = (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-br from-purple-50/50 to-white"
    >
      {messages.map((m) => (
        <div key={m.id}>
          <Message role={m.role} pending={m.pending}>
            {m.content}
          </Message>
          {SHOW_CITATIONS && m.citations?.length ? (
            <SourceList items={m.citations} />
          ) : null}
        </div>
      ))}
    </div>
  );

  const inputEl = (
    <div className="border-t border-purple-100 bg-white p-4 rounded-b-2xl">
      {error ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder="Digite sua mensagem..."
          className="flex-1 w-full resize-none rounded-xl border-2 border-purple-200 bg-purple-50/30 px-4 py-3 text-sm outline-none focus:border-[#A543FB] focus:ring-4 focus:ring-purple-100"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="rounded-xl bg-gradient-to-br from-[#A543FB] to-[#7e22ce] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </div>
    </div>
  );

  if (embed) {
    return (
      <div className="relative w-full h-[480px] overflow-hidden rounded-2xl shadow-xl flex flex-col border border-white/10 bg-white">
        {headerEl}
        <div className="flex flex-col flex-1 min-h-0">
          {messagesEl}
          {inputEl}
        </div>
      </div>
    );
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-3 rounded-full bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white px-6 py-4 shadow-2xl hover:scale-105 active:scale-95 transition-all"
          aria-label="Abrir chat de suporte"
        >
          💬 <span className="font-semibold">Precisa de ajuda?</span>
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[min(94vw,420px)] overflow-hidden rounded-2xl shadow-2xl flex flex-col border border-white/10 max-h-[60vh] bg-white">
          {headerEl}
          <div className="flex flex-col flex-1 min-h-0">
            {messagesEl}
            {inputEl}
          </div>
        </div>
      )}
    </>
  );
}
