// src/components/VideoCenter.jsx
import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

/**
 * VideoCenter — public/videos + visualização em modal
 * - Lista por public/videos/manifest.json (se existir) ou HARDCODED_FILES (fallback)
 * - Respeita import.meta.env.BASE_URL (Vite/GitHub Pages)
 * - Mostra tamanho via HEAD quando disponível
 * - Baixa todos em .zip
 * - Clicar no vídeo abre um modal com player, botão Fechar e backdrop
 */

const HARDCODED_FILES = [
  "Datas personalizadas.mp4",
  "Instação cardapinho (comprimido).mp4",
  "associar codigo interno com pdv do ifood.mp4",
  "reinstalar-o-cardapinho (comprimido).mp4",
  "sangria pagamento, financeiro..mp4",
];

function byExtToMime(name = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const m = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
  };
  return m[ext] || "video/*";
}

function humanSize(bytes = 0) {
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function buildUrlFromPublic(name) {
  // Respeita o base do Vite (ex.: /suporte-cw/ em GitHub Pages)
  const base = import.meta.env.BASE_URL || "/";
  const encoded = name.split("/").map(encodeURIComponent).join("/");
  return `${base}videos/${encoded}`;
}

export default function VideoCenter() {
  const [videos, setVideos] = useState([]); // [{name,url,size,type}]
  const [loading, setLoading] = useState(true);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [error, setError] = useState("");

  // Modal de visualização
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerVideo, setViewerVideo] = useState(null); // {name,url,type}

  // Carrega manifest.json (ou fallback)
  useEffect(() => {
    let cancelled = false;
    async function loadList() {
      setLoading(true);
      setError("");
      try {
        const base = import.meta.env.BASE_URL || "/";
        const res = await fetch(`${base}videos/manifest.json`, { cache: "no-store" });
        let files = [];
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) files = data;
        } else {
          files = HARDCODED_FILES;
        }

        const list = (files || []).map((name) => ({
          name,
          url: buildUrlFromPublic(name),
          size: null,
          type: byExtToMime(name),
        }));

        if (!cancelled) setVideos(list);
      } catch {
        if (!cancelled) {
          setError("Não foi possível carregar a lista de vídeos.");
          setVideos([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadList();
    return () => {
      cancelled = true;
    };
  }, []);

  // HEAD para obter tamanhos
  useEffect(() => {
    let cancelled = false;
    async function loadSizes() {
      if (!videos.length) return;
      setLoadingSizes(true);
      try {
        const updated = [];
        for (const v of videos) {
          try {
            const r = await fetch(v.url, { method: "HEAD" });
            const len = Number(r.headers.get("content-length"));
            updated.push({ ...v, size: Number.isFinite(len) ? len : null });
          } catch {
            updated.push({ ...v, size: null });
          }
        }
        if (!cancelled) setVideos(updated);
      } finally {
        if (!cancelled) setLoadingSizes(false);
      }
    }
    loadSizes();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos.length]);

  const totalSize = useMemo(
    () => videos.reduce((acc, v) => acc + (v.size || 0), 0),
    [videos]
  );

  async function downloadZip() {
    if (!videos.length) return;
    const zip = new JSZip();
    const folder = zip.folder("videos");
    for (const v of videos) {
      const resp = await fetch(v.url);
      if (!resp.ok) throw new Error(`Falha ao baixar ${v.name} (${resp.status})`);
      const buf = await resp.arrayBuffer();
      folder.file(v.name, buf);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "meus-videos.zip");
  }

  function openViewer(v) {
    setViewerVideo(v);
    setViewerOpen(true);
  }
  function closeViewer() {
    setViewerOpen(false);
    setViewerVideo(null);
  }

  // ESC fecha o modal
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") closeViewer();
    }
    if (viewerOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerOpen]);

  return (
    <section className="rounded-2xl border border-purple-500/20 bg-gray-900/60 p-8 shadow-[0_0_30px_rgba(157,0,255,0.15)] backdrop-blur-md space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-500 flex items-center justify-center">
          <span className="text-2xl">🎥</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Central de Vídeos</h2>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-300">Carregando lista...</div>
      ) : videos.length === 0 ? (
        <div className="text-sm text-gray-300 space-y-2">
          <p>
            Nenhum arquivo encontrado. Coloque seus vídeos em{" "}
            <code className="px-1 rounded bg-gray-800 border border-gray-700 text-gray-200">public/videos/</code>.
          </p>
          <p>
            Para listar automaticamente, crie{" "}
            <code className="px-1 rounded bg-gray-800 border border-gray-700 text-gray-200">public/videos/manifest.json</code> com:
          </p>
          <pre className="text-xs p-2 bg-gray-800 border border-gray-700 rounded text-gray-200">{`[
  "Datas personalizadas.mp4",
  "Instação cardapinho (comprimido).mp4"
]`}</pre>
          <p className="text-xs text-gray-400">
            Alternativamente, edite a constante <b>HARDCODED_FILES</b> dentro de <i>VideoCenter.jsx</i>.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden border border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/70 text-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 border-r border-gray-700">Arquivo</th>
                  <th className="text-left px-4 py-3 border-r border-gray-700">Tamanho</th>
                  <th className="text-left px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v, idx) => (
                  <tr key={idx} className="odd:bg-gray-900/40 even:bg-gray-900/20 text-gray-200">
                    <td className="px-4 py-3 border-r border-gray-800 align-top">
                      <button
                        onClick={() => openViewer(v)}
                        className="font-medium text-fuchsia-300 hover:text-fuchsia-200 underline-offset-2 hover:underline"
                        title="Assistir"
                      >
                        {v.name}
                      </button>
                      <div className="text-xs text-gray-400 break-all mt-1">{v.url}</div>
                    </td>
                    <td className="px-4 py-3 border-r border-gray-800 align-top">
                      {loadingSizes ? "…" : humanSize(v.size)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={v.url}
                          download={v.name}
                          className="inline-flex items-center rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                        >
                          Baixar
                        </a>
                        <button
                          onClick={() => openViewer(v)}
                          className="inline-flex items-center rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Assistir
                        </button>
                        {/* Mini preview clicável */}
                        <button
                          onClick={() => openViewer(v)}
                          className="rounded border border-gray-700 overflow-hidden"
                          title="Pré-visualizar"
                        >
                          <video
                            src={v.url}
                            className="h-12 w-24 object-cover bg-black"
                            muted
                            preload="metadata"
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-800/70 text-gray-200">
                <tr>
                  <td className="px-4 py-3 font-medium">Total</td>
                  <td className="px-4 py-3 font-medium">{loadingSizes ? "…" : humanSize(totalSize)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">Arquivos listados: {videos.length}</div>
            <button
              onClick={downloadZip}
              className="inline-flex items-center rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow"
            >
              Baixar tudo (.zip)
            </button>
          </div>
        </>
      )}

      {/* Modal de visualização */}
      {viewerOpen && viewerVideo && (
        <div className="fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeViewer}
          />
          {/* Container */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-purple-500/30 bg-gray-900 shadow-[0_0_35px_rgba(157,0,255,0.35)] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <div className="min-w-0">
                  <h3 className="text-white font-semibold truncate">
                    {viewerVideo.name}
                  </h3>
                  <p className="text-xs text-gray-400">{viewerVideo.url}</p>
                </div>
                <button
                  onClick={closeViewer}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
                >
                  Fechar
                </button>
              </div>
              {/* Player */}
              <div className="bg-black">
                <video
                  key={viewerVideo.url}
                  src={viewerVideo.url}
                  controls
                  className="mx-auto w-full max-h-[70vh]"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
