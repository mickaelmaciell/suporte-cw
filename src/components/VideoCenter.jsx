import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const VERSION = "VideoCenter v3.2-debug";

const HARDCODED_FILES = [
  "Datas personalizadas.mp4",
  "Instação cardapinho (comprimido).mp4",
  "associar codigo interno com pdv do ifood.mp4",
  "reinstalar-o-cardapinho (comprimido).mp4",
  "sangria pagamento, financeiro..mp4",
  "Chamado TUNA.mp4", // <- queremos este SEM FALHAR
];

function byExtToMime(name = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const m = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska" };
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
  const base = import.meta.env.BASE_URL || "/";
  const encoded = name.split("/").map(encodeURIComponent).join("/");
  const url = `${base}videos/${encoded}`;
  console.debug("[VideoCenter] buildUrlFromPublic()", { base, name, encoded, url });
  return url;
}

// Componente Modal customizado seguindo o padrão da aplicação
const VideoModal = ({ isOpen, onClose, video }) => {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !video) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 mx-4 w-full max-w-4xl rounded-3xl bg-white/80 dark:bg-black/40 border border-purple-300/50 dark:border-purple-500/30 backdrop-blur-xl shadow-[0_8px_32px_rgba(139,92,246,0.3)] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between p-6 border-b border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/80 backdrop-blur-lg">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white truncate">
              🎥 {video.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 break-all">
              {video.url}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 px-4 py-2 bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white rounded-xl font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
          >
            Fechar (Esc)
          </button>
        </div>
        <div className="flex-1 bg-black flex items-center justify-center">
          <video
            key={video.url}
            src={video.url}
            controls
            className="w-full h-full max-h-[70vh] object-contain"
            onError={(e) => console.error("[VideoCenter] player onError", video, e)}
            onLoadedData={() => console.debug("[VideoCenter] player loaded", video)}
          />
        </div>
      </div>
    </div>
  );
};

export default function VideoCenter() {
  const [videos, setVideos] = useState([]); // [{name,url,size,type}]
  const [loading, setLoading] = useState(true);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [error, setError] = useState("");

  // Debug state
  const [manifestRaw, setManifestRaw] = useState("");
  const [manifestArray, setManifestArray] = useState([]);
  const [notes, setNotes] = useState([]); // mensagens curtas de depuração

  // Modal
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerVideo, setViewerVideo] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      setLoading(true);
      setError("");
      setNotes([]);
      const base = import.meta.env.BASE_URL || "/";
      const bust = Date.now(); // cache busting forte
      const manifestUrl = `${base}videos/manifest.json?ts=${bust}`;
      console.info("[VideoCenter] INIT loadList()", { VERSION, base, manifestUrl });

      console.time("[VideoCenter] fetch manifest");
      let manifestFiles = [];
      try {
        const res = await fetch(manifestUrl, { cache: "no-store" });
        console.debug("[VideoCenter] manifest status", res.status, res.statusText);
        if (res.ok) {
          const txt = await res.text();
          setManifestRaw(txt);
          console.debug("[VideoCenter] manifest raw:", txt);
          try {
            const parsed = JSON.parse(txt);
            if (Array.isArray(parsed)) {
              manifestFiles = parsed;
              setManifestArray(parsed);
              console.info("[VideoCenter] manifest OK (array)", { count: parsed.length });
            } else {
              setNotes((n) => [...n, "manifest.json não é um array"]);
              console.warn("[VideoCenter] manifest não é array", parsed);
            }
          } catch (e) {
            setNotes((n) => [...n, "Falha ao parsear manifest.json"]);
            console.error("[VideoCenter] JSON parse error:", e);
          }
        } else {
          setNotes((n) => [...n, `manifest.json não encontrado (status ${res.status}) -- usando fallback`]);
          console.info("[VideoCenter] manifest não encontrado. Fallback.");
        }
      } catch (err) {
        setNotes((n) => [...n, "Erro de rede ao buscar manifest.json (fallback)"]);
        console.warn("[VideoCenter] Falha ao buscar manifest:", err);
      } finally {
        console.timeEnd("[VideoCenter] fetch manifest");
      }

      // MESCLA + garante o "Chamado TUNA.mp4"
      const setUnique = new Set([...(manifestFiles || []), ...HARDCODED_FILES]);
      setUnique.add("Chamado TUNA.mp4"); // forçado
      const files = Array.from(setUnique);

      // Diagnóstico: diferenças entre manifest e hardcoded
      const inManifestNotHardcoded = (manifestFiles || []).filter((f) => !HARDCODED_FILES.includes(f));
      const inHardcodedNotManifest = HARDCODED_FILES.filter((f) => !(manifestFiles || []).includes(f));
      console.info("[VideoCenter] Diferenças", { inManifestNotHardcoded, inHardcodedNotManifest });

      const list = files.map((name) => {
        const url = buildUrlFromPublic(name);
        return {
          name,
          url,
          // cache-busting leve na miniatura (apenas no <video> preview)
          previewUrl: `${url}?ts=${bust}`,
          size: null,
          type: byExtToMime(name),
        };
      });

      console.info("[VideoCenter] Lista final unificada", { total: list.length, list });

      if (cancelled) return;
      setVideos(list);
      setLoading(false);
    }

    loadList();
    return () => {
      cancelled = true;
    };
  }, []);

  // HEAD para tamanhos
  useEffect(() => {
    let cancelled = false;

    async function loadSizes() {
      if (!videos.length) return;
      console.info("[VideoCenter] INIT loadSizes()", { count: videos.length });
      setLoadingSizes(true);
      console.time("[VideoCenter] HEAD sizes total");

      try {
        const updated = [];
        let i = 0;
        for (const v of videos) {
          i++;
          console.time(`[VideoCenter] HEAD ${i}/${videos.length} ${v.name}`);
          try {
            const r = await fetch(v.url, { method: "HEAD" });
            const lenRaw = r.headers.get("content-length");
            const len = Number(lenRaw);
            console.debug("[VideoCenter] HEAD resp", { name: v.name, status: r.status, lenRaw, len });
            updated.push({ ...v, size: Number.isFinite(len) ? len : null });
          } catch (e) {
            console.warn("[VideoCenter] HEAD erro", { name: v.name, url: v.url, error: e });
            updated.push({ ...v, size: null });
          } finally {
            console.timeEnd(`[VideoCenter] HEAD ${i}/${videos.length} ${v.name}`);
          }
        }
        if (!cancelled) setVideos(updated);
      } finally {
        console.timeEnd("[VideoCenter] HEAD sizes total");
        if (!cancelled) setLoadingSizes(false);
      }
    }

    loadSizes();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos.length]);

  const totalSize = useMemo(() => {
    const total = videos.reduce((acc, v) => acc + (v.size || 0), 0);
    console.debug("[VideoCenter] totalSize", { totalBytes: total, human: humanSize(total) });
    return total;
  }, [videos]);

  async function downloadZip() {
    try {
      console.info("[VideoCenter] downloadZip START", { count: videos.length });
      if (!videos.length) return;
      const zip = new JSZip();
      const folder = zip.folder("videos");

      let idx = 0;
      for (const v of videos) {
        idx++;
        console.time(`[VideoCenter] GET bin ${idx}/${videos.length} ${v.name}`);
        const resp = await fetch(v.url);
        console.debug("[VideoCenter] GET status", { name: v.name, status: resp.status });
        if (!resp.ok) throw new Error(`Falha ao baixar ${v.name} (${resp.status})`);
        const buf = await resp.arrayBuffer();
        folder.file(v.name, buf);
        console.timeEnd(`[VideoCenter] GET bin ${idx}/${videos.length} ${v.name}`);
      }

      console.time("[VideoCenter] zip.generateAsync");
      const blob = await zip.generateAsync({ type: "blob" });
      console.timeEnd("[VideoCenter] zip.generateAsync");

      saveAs(blob, "meus-videos.zip");
      console.info("[VideoCenter] downloadZip DONE");
    } catch (e) {
      console.error("[VideoCenter] downloadZip ERRO", e);
      setError("Falha ao baixar ZIP. Veja o console para detalhes.");
    }
  }

  function openViewer(v) {
    console.info("[VideoCenter] openViewer", v);
    setViewerVideo(v);
    setViewerOpen(true);
  }

  function closeViewer() {
    console.info("[VideoCenter] closeViewer");
    setViewerOpen(false);
    setViewerVideo(null);
  }

  return (
    <section className="rounded-3xl p-8 border backdrop-blur-xl bg-white/80 dark:bg-black/40 border-purple-300/50 dark:border-purple-500/30 shadow-[0_8px_32px_rgba(139,92,246,0.2)] hover:shadow-[0_12px_48px_rgba(139,92,246,0.3)] transition-all duration-300">
      {/* Header */}
      <div className="flex items-center gap-6 mb-10">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-500 via-violet-600 to-purple-700 shadow-lg shadow-purple-500/30 border border-purple-400/30">
          <span className="text-3xl">🎥</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white">
            Central de Vídeos
          </h2>
          <p className="text-gray-600 dark:text-gray-300 text-lg mt-2">
            Biblioteca de vídeos de treinamento e materiais de suporte
          </p>
        </div>
      </div>

      {/* Debug Info */}
      <details className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg mb-6">
        <summary className="cursor-pointer font-medium text-gray-800 dark:text-white text-lg">
          🔧 Informações de Debug
        </summary>
        <div className="mt-6 grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-300/50 dark:border-gray-600/50 bg-gray-100/80 dark:bg-slate-700/40 p-4">
              <h4 className="font-semibold text-gray-800 dark:text-white mb-3">Configuração</h4>
              <div className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
                <div><strong>Versão:</strong> {VERSION}</div>
                <div><strong>BASE_URL:</strong> {import.meta.env.BASE_URL || "/"}</div>
                <div><strong>Manifest URL:</strong> {(import.meta.env.BASE_URL || "/") + "videos/manifest.json"}</div>
                <div><strong>Arquivos na lista final:</strong> {videos.length}</div>
              </div>
              {notes.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-amber-100/80 dark:bg-amber-900/30 border border-amber-300/50 dark:border-amber-500/30">
                  <div className="text-sm font-medium text-amber-800 dark:text-amber-200">Notas:</div>
                  <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    {notes.join(" · ")}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <details className="rounded-lg border border-gray-300/50 dark:border-gray-600/50 bg-gray-100/80 dark:bg-slate-700/40 p-4">
              <summary className="cursor-pointer font-semibold text-gray-800 dark:text-white">Manifest (raw)</summary>
              <pre className="mt-3 max-h-40 overflow-auto p-3 bg-black/40 dark:bg-black/60 rounded border border-gray-300 dark:border-gray-600 text-xs text-gray-200 whitespace-pre-wrap">
                {manifestRaw || "(vazio ou 404)"}
              </pre>
            </details>
            <details className="rounded-lg border border-gray-300/50 dark:border-gray-600/50 bg-gray-100/80 dark:bg-slate-700/40 p-4">
              <summary className="cursor-pointer font-semibold text-gray-800 dark:text-white">Manifest (array)</summary>
              <pre className="mt-3 max-h-40 overflow-auto p-3 bg-black/40 dark:bg-black/60 rounded border border-gray-300 dark:border-gray-600 text-xs text-gray-200">
                {JSON.stringify(manifestArray, null, 2)}
              </pre>
            </details>
            <details className="rounded-lg border border-gray-300/50 dark:border-gray-600/50 bg-gray-100/80 dark:bg-slate-700/40 p-4">
              <summary className="cursor-pointer font-semibold text-gray-800 dark:text-white">Lista final</summary>
              <pre className="mt-3 max-h-40 overflow-auto p-3 bg-black/40 dark:bg-black/60 rounded border border-gray-300 dark:border-gray-600 text-xs text-gray-200">
                {JSON.stringify(videos.map(v => v.name), null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </details>

      {error && (
        <div className="rounded-xl border border-red-300/60 dark:border-red-500/40 bg-red-100/80 dark:bg-red-600/20 text-red-700 dark:text-red-200 p-4 text-sm mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-8 backdrop-blur-lg text-center">
          <div className="w-12 h-12 border-4 border-purple-200 dark:border-purple-700 border-t-purple-600 dark:border-t-purple-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Carregando lista de vídeos...</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-8 backdrop-blur-lg text-center">
          <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📂</span>
          </div>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">Nenhum vídeo encontrado</h3>
          <div className="text-gray-600 dark:text-gray-300 space-y-2 max-w-md mx-auto">
            <p>
              Coloque seus vídeos em{" "}
              <code className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-500/30 text-purple-600 dark:text-purple-400">public/videos/</code>
            </p>
            <p>
              Para listar automaticamente, crie{" "}
              <code className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-500/30 text-purple-600 dark:text-purple-400">public/videos/manifest.json</code>
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tabela de Vídeos */}
          <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                📋 Lista de Vídeos ({videos.length})
              </h3>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                <strong>Tamanho total:</strong> {loadingSizes ? "Calculando..." : humanSize(totalSize)}
              </div>
            </div>

            <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 backdrop-blur-lg">
              <table className="w-full text-sm">
                <thead className="bg-purple-100/80 dark:bg-slate-700/60">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-800 dark:text-white border-r border-gray-200/50 dark:border-gray-600/50">
                      Arquivo
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-800 dark:text-white border-r border-gray-200/50 dark:border-gray-600/50 w-32">
                      Tamanho
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-800 dark:text-white w-80">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {videos.map((v, idx) => (
                    <tr key={idx} className="border-t border-gray-200/50 dark:border-gray-600/50 hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="px-4 py-4 border-r border-gray-200/50 dark:border-gray-600/50">
                        <button
                          onClick={() => openViewer(v)}
                          className="font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:underline text-left"
                          title="Assistir vídeo"
                        >
                          {v.name}
                        </button>
                        <div className="text-xs text-gray-500 dark:text-gray-400 break-all mt-1 max-w-md">
                          {v.url}
                        </div>
                      </td>
                      <td className="px-4 py-4 border-r border-gray-200/50 dark:border-gray-600/50 text-gray-700 dark:text-gray-200 font-medium">
                        {loadingSizes ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                            <span className="text-xs">...</span>
                          </div>
                        ) : (
                          humanSize(v.size)
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          <a
                            href={v.url}
                            download={v.name}
                            onClick={() => console.debug("[VideoCenter] click Baixar", v)}
                            className="inline-flex items-center gap-2 rounded-lg bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white px-3 py-2 text-xs font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
                          >
                            📥 Baixar
                          </a>
                          <button
                            onClick={() => openViewer(v)}
                            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white px-3 py-2 text-xs font-medium transition-all duration-200 shadow-lg"
                          >
                            ▶️ Assistir
                          </button>
                          {/* Mini preview */}
                          <button
                            onClick={() => openViewer(v)}
                            className="rounded-lg border border-purple-300/50 dark:border-purple-500/30 overflow-hidden hover:border-purple-400 dark:hover:border-purple-400 transition-colors"
                            title="Pré-visualizar vídeo"
                          >
                            <video
                              src={v.previewUrl}
                              className="h-12 w-20 object-cover bg-black"
                              muted
                              preload="metadata"
                              onError={(e) => console.error("[VideoCenter] preview onError", v, e)}
                              onLoadedData={() => console.debug("[VideoCenter] preview loaded", v)}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ações Gerais */}
          <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg">
            <div className="flex items-center justify-between">
              <div className="text-gray-600 dark:text-gray-300">
                <span className="text-sm">
                  📊 <strong>{videos.length}</strong> vídeos disponíveis
                  {totalSize > 0 && (
                    <> • <strong>{humanSize(totalSize)}</strong> total</>
                  )}
                </span>
              </div>
              <button
                onClick={downloadZip}
                disabled={!videos.length || loadingSizes}
                className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all duration-300 ${!videos.length || loadingSizes
                    ? "bg-gray-300/60 dark:bg-slate-600/40 text-gray-500 dark:text-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-[0_8px_32px_rgba(16,185,129,0.35)] hover:shadow-[0_12px_48px_rgba(16,185,129,0.5)] transform hover:scale-[1.02]"
                  }`}
              >
                📦 Baixar tudo (.zip)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Video */}
      <VideoModal
        isOpen={viewerOpen}
        onClose={closeViewer}
        video={viewerVideo}
      />
    </section>
  );
}