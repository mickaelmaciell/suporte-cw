// src/components/VideoCenter.jsx
import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

/**
 * VideoCenter (GitHub Pages friendly)
 * - Lista vídeos de src/assets/videos usando import.meta.glob (Vite)
 * - Mostra tamanho (via HEAD quando disponível) e permite baixar tudo em .zip
 * - Funciona em build e no GitHub Pages (com base setado em vite.config.js)
 */

// GLOBS RELATIVOS (SEM barra inicial). O Vite resolverá para /assets/... na build
const videoMap = import.meta.glob(
  "./assets/videos/*.{mp4,webm,mov,mkv}",
  {
    eager: true,
    import: "default",
    query: "?url",
  }
);

function buildVideoListFromGlob() {
  return Object.entries(videoMap).map(([relPath, url]) => {
    const name = relPath.split("/").pop() || url.split("/").pop();
    return { name, url, size: null, type: guessMimeByExt(name) };
  });
}

function guessMimeByExt(name = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const table = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
  };
  return table[ext] || "video/*";
}

function humanSize(bytes = 0) {
  if (bytes == null || Number.isNaN(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export default function VideoCenter() {
  const [videos, setVideos] = useState(() => buildVideoListFromGlob());
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSizes() {
      setLoadingSizes(true);
      setError("");
      try {
        const updated = [];
        for (const v of videos) {
          try {
            const res = await fetch(v.url, { method: "HEAD" });
            const size = Number(res.headers.get("content-length"));
            updated.push({ ...v, size: Number.isFinite(size) ? size : null });
          } catch {
            updated.push({ ...v, size: null });
          }
        }
        if (!cancelled) setVideos(updated);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingSizes(false);
      }
    }
    if (videos.length > 0) loadSizes();
    return () => { cancelled = true; };
  }, []); // uma vez ao montar

  const totalSize = useMemo(
    () => videos.reduce((acc, v) => acc + (v.size || 0), 0),
    [videos]
  );

  async function downloadZip() {
    if (videos.length === 0) return;
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

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold">Central de Vídeos (repositório)</h2>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Erro ao carregar tamanhos: {error}
        </div>
      )}

      {videos.length === 0 ? (
        <div className="text-sm text-gray-600">
          Nenhum arquivo encontrado em <code className="px-1 rounded bg-gray-100">src/assets/videos/</code>.
          <br />
          Adicione seus <b>.mp4 / .webm / .mov / .mkv</b> e faça commit/push.
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 border-r">Arquivo</th>
                  <th className="text-left px-3 py-2 border-r">Tamanho</th>
                  <th className="text-left px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v, idx) => (
                  <tr key={idx} className="odd:bg-gray-50">
                    <td className="px-3 py-2 border-r align-top">
                      <div className="font-medium">{v.name}</div>
                      <div className="text-xs text-gray-500 break-all">{v.url}</div>
                    </td>
                    <td className="px-3 py-2 border-r align-top">
                      {loadingSizes ? "..." : humanSize(v.size)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={v.url}
                          download={v.name}
                          className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                        >
                          Baixar
                        </a>
                        <video
                          src={v.url}
                          controls
                          className="h-12 rounded border bg-black"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td className="px-3 py-2 font-medium">Total</td>
                  <td className="px-3 py-2 font-medium">{loadingSizes ? "..." : humanSize(totalSize)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">Arquivos listados: {videos.length}</div>
            <button
              onClick={downloadZip}
              className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Baixar tudo (.zip)
            </button>
          </div>
        </>
      )}
    </section>
  );
}
