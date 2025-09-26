// src/components/VideoCenter.jsx
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
          setNotes((n) => [...n, `manifest.json não encontrado (status ${res.status}) — usando fallback`]);
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

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        console.debug("[VideoCenter] ESC -> closeViewer");
        closeViewer();
      }
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

      {/* Debug header */}
      <div className="text-xs text-gray-300 grid md:grid-cols-2 gap-3 p-3 rounded-lg border border-gray-700 bg-gray-800/40">
        <div className="space-y-1">
          <div><b>Versão:</b> {VERSION}</div>
          <div><b>BASE_URL:</b> {import.meta.env.BASE_URL || "/"}</div>
          <div><b>Manifest URL:</b> {(import.meta.env.BASE_URL || "/") + "videos/manifest.json"}</div>
          <div><b>Arquivos na lista final:</b> {videos.length}</div>
          {notes.length > 0 && (
            <div className="text-amber-300"><b>Notas:</b> {notes.join(" · ")}</div>
          )}
        </div>
        <div className="space-y-1">
          <details>
            <summary className="cursor-pointer text-gray-200">Manifest (raw)</summary>
            <pre className="mt-2 max-h-40 overflow-auto p-2 bg-black/40 rounded border border-gray-700 whitespace-pre-wrap">
{manifestRaw || "(vazio ou 404)"}
            </pre>
          </details>
          <details className="mt-2">
            <summary className="cursor-pointer text-gray-200">Manifest (array)</summary>
            <pre className="mt-2 max-h-40 overflow-auto p-2 bg-black/40 rounded border border-gray-700">
{JSON.stringify(manifestArray, null, 2)}
            </pre>
          </details>
          <details className="mt-2">
            <summary className="cursor-pointer text-gray-200">Lista final</summary>
            <pre className="mt-2 max-h-40 overflow-auto p-2 bg-black/40 rounded border border-gray-700">
{JSON.stringify(videos.map(v => v.name), null, 2)}
            </pre>
          </details>
        </div>
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
            <code className="px-1 rounded bg-gray-800 border border-gray-700 text-gray-200">public/videos/manifest.json</code>.
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
                          onClick={() => console.debug("[VideoCenter] click Baixar", v)}
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
                        {/* Mini preview com cache busting */}
                        <button
                          onClick={() => openViewer(v)}
                          className="rounded border border-gray-700 overflow-hidden"
                          title="Pré-visualizar"
                        >
                          <video
                            src={v.previewUrl}
                            className="h-12 w-24 object-cover bg-black"
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

      {/* Modal */}
      {viewerOpen && viewerVideo && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeViewer} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-purple-500/30 bg-gray-900 shadow-[0_0_35px_rgba(157,0,255,0.35)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <div className="min-w-0">
                  <h3 className="text-white font-semibold truncate">{viewerVideo.name}</h3>
                  <p className="text-xs text-gray-400">{viewerVideo.url}</p>
                </div>
                <button onClick={closeViewer} className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800">
                  Fechar
                </button>
              </div>
              <div className="bg-black">
                <video
                  key={viewerVideo.url}
                  src={viewerVideo.url}
                  controls
                  className="mx-auto w-full max-h-[70vh]"
                  onError={(e) => console.error("[VideoCenter] player onError", viewerVideo, e)}
                  onLoadedData={() => console.debug("[VideoCenter] player loaded", viewerVideo)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
