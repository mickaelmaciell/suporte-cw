// src/components/VideoCenter.jsx
import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

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
  // Respeita o base do Vite (ex.: /suporte-cw/)
  const base = import.meta.env.BASE_URL || "/";
  // encodeURIComponent no nome do arquivo (mantém subpastas se houver)
  const encoded = name.split("/").map(encodeURIComponent).join("/");
  return `${base}videos/${encoded}`;
}

export default function VideoCenter() {
  const [videos, setVideos] = useState([]); // [{name,url,size,type}]
  const [loading, setLoading] = useState(true);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [error, setError] = useState("");

  // Carrega lista do manifest.json; se não existir, usa HARDCODED_FILES
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

  // Tenta obter tamanho via HEAD
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

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold">Central de Vídeos (public/videos)</h2>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-600">Carregando lista...</div>
      ) : videos.length === 0 ? (
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            Nenhum arquivo encontrado. Coloque seus vídeos em{" "}
            <code className="px-1 rounded bg-gray-100">public/videos/</code>.
          </p>
          <p>
            Para listar automaticamente, crie{" "}
            <code className="px-1 rounded bg-gray-100">public/videos/manifest.json</code> com:
          </p>
          <pre className="text-xs p-2 bg-gray-50 border rounded">
{`[
  "Datas personalizadas.mp4",
  "Instação cardapinho (comprimido).mp4"
]`}
          </pre>
          <p className="text-xs text-gray-500">
            Alternativamente, edite a constante <b>HARDCODED_FILES</b> dentro de
            <code className="px-1 rounded bg-gray-100"> VideoCenter.jsx</code>.
          </p>
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
                      <div className="font-medium break-words">{v.name}</div>
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
                  <td className="px-3 py-2 font-medium">
                    {loadingSizes ? "..." : humanSize(totalSize)}
                  </td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">
              Arquivos listados: {videos.length}
            </div>
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
