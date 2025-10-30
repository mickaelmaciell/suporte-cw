// src/components/ChatWidget/Message.jsx
import { useState } from "react";

export default function Message({ role, children, pending }) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(String(children ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} my-2`}>
      <div
        className={[
          "group relative max-w-[90%] rounded-2xl px-4 py-3 shadow text-sm leading-relaxed break-words",
          "whitespace-pre-wrap", // preserva \n do n8n
          isUser
            ? "bg-[#A543FB]/10 border border-[#A543FB]/30 text-gray-900"
            : "bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100",
        ].join(" ")}
      >
        {pending ? (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse [animation-delay:.2s]" />
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse [animation-delay:.4s]" />
            <span>Pensando...</span>
          </div>
        ) : (
          String(children ?? "")
        )}

        {/* botão copiar (apenas mensagens do bot) */}
        {!isUser && !pending && (
          <button
            onClick={copyToClipboard}
            className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2 -right-2 text-[11px] rounded-full bg-black/60 text-white px-2 py-1"
            title="Copiar resposta"
          >
            {copied ? "Copiado!" : "Copiar"}
          </button>
        )}
      </div>
    </div>
  );
}
