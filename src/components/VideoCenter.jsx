// src/components/VideoCenter.jsx
import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

/**
 * VideoCenter (estilo padronizado roxo/vidro)
 * - Lista automaticamente os vídeos em src/assets/videos/
 * - Vite import.meta.glob com query '?url' + eager:true (gera URLs estáticas no build)
 * - Busca tamanho via HEAD (Content-Length), quando disponível
 * - Preview <video>, download individual e "Baixar tudo (.zip)"
 *
 * IMPORTANTE:
 * 1) Coloque seus vídeos em: src/assets/videos/
 * 2) Faça commit/push — no GitHub Pages esses arquivos estáticos serão servidos
 * 3) Este componente NÃO envia nada para o GitHub; apenas lista o que já está no repo
 */

// Vite: pega URLs de todos os vídeos na pasta
// Para incluir subpastas, troque o glob para "/src/assets/videos/**/*.{mp4,webm,mov,mkv}"
const videoMap = import.meta.glob("/src/assets/videos/*.{mp4,webm,mov,mkv}", {
  eager: true,
  import: "default",
  query: "?url",
});

// Converte o objeto do glob para lista
function buildVideoListFromGlob() {
  return Object.entries(videoMap).map(([absPath, url]) => {
    const name = absPath.split("/").pop();
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
  const [zipping, setZipping] = useState(false);

  // Busca tamanho via HEAD (same-origin)
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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // apenas ao montar

  const totalSize = useMemo(
    () => videos.reduce((acc, v) => acc + (v.size || 0), 0),
    [videos]
  );

  async function downloadZip() {
    if (videos.length === 0 || zipping) return;
    setZipping(true);
    setError("");
    try {
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
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setZipping(false);
    }
  }

  /* ====== UI com tema roxo/vidro ====== */
  const card =
    "rounded-2xl border border-[#9D00FF]/30 bg-black/40 backdrop-blur-lg p-6 md:p-8 shadow-[0_0_20px_rgba(157,0,255,0.25)]";
  const badge =
    "w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center bg-gradient-to-r from-[#9D00FF] to-[#B84CFF]";
  const pill =
    "inline-flex items-center rounded-md px-2.5 py-1 text-xs border border-gray-700 bg-gray-800/60 text-gray-200";

  return (
    <div className={card}>
      <div className="flex items-center gap-4 mb-6">
        <div className={badge}>
          <span className="text-2xl">🎥</span>
        </div>
        <div>
          <h3 className="text-2xl font-bold">Central de Vídeos (repositório)</h3>
          <p className="text-gray-300 text-sm mt-1">
            Lista os arquivos em <code className="px-1 rounded bg-gray-900 border border-gray-700">src/assets/videos/</code> e permite baixar individualmente ou tudo em .zip
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-600/40 bg-rose-900/20 text-rose-200 p-4 text-sm mb-4">
          <b>Erro:</b> {error}
        </div>
      )}

      {videos.length === 0 ? (
        <div className="text-sm text-gray-300">
          Nenhum arquivo encontrado em{" "}
          <code className="px-1 rounded bg-gray-900 border border-gray-700">
            src/assets/videos/
          </code>
          .<br />
          Adicione seus <b>.mp4 / .webm / .mov / .mkv</b> e faça commit/push.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-700 overflow-hidden bg-gray-900/40">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/60">
                <tr>
                  <th className="text-left px-4 py-2 border-r border-gray-700">Arquivo</th>
                  <th className="text-left px-4 py-2 border-r border-gray-700">Tamanho</th>
                  <th className="text-left px-4 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v, idx) => (
                  <tr key={idx} className="odd:bg-gray-800/30 even:bg-gray-900/20">
                    <td className="px-4 py-3 border-r border-gray-700 align-top">
                      <div className="font-medium text-white">{v.name}</div>
                      <div className="text-xs text-gray-400 break-all">{v.url}</div>
                    </td>
                    <td className="px-4 py-3 border-r border-gray-700 align-top">
                      {loadingSizes ? <span className={pill}>calculando…</span> : humanSize(v.size)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={v.url}
                          download={v.name}
                          className="inline-flex items-center rounded-lg bg-gradient-to-r from-[#9D00FF] to-[#B84CFF] px-3 py-1.5 text-xs font-semibold text-white hover:from-[#7A00CC] hover:to-[#9D00FF] shadow-[0_0_12px_rgba(157,0,255,0.35)]"
                        >
                          Baixar
                        </a>
                        <video
                          src={v.url}
                          controls
                          className="h-12 rounded border border-gray-700 bg-black"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-800/60">
                  <td className="px-4 py-2 font-medium">Total</td>
                  <td className="px-4 py-2 font-medium">
                    {loadingSizes ? "…" : humanSize(totalSize)}
                  </td>
                  <td className="px-4 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-xs text-gray-300">
              Arquivos listados: <b>{videos.length}</b>
            </div>
            <button
              onClick={downloadZip}
              disabled={zipping || videos.length === 0}
              className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all ${
                zipping
                  ? "bg-gray-600 cursor-wait"
                  : "bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
              }`}
            >
              {zipping ? "Compactando..." : "Baixar tudo (.zip)"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
