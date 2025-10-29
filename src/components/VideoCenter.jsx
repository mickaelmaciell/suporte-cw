// src/components/VideoCenter.jsx
import { useState, useEffect, useMemo } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const VERSION = "VideoCenter v4.3-publicdir-fix";

/**
 * TODAS AS CATEGORIAS QUE APARECEM NA UI
 */
const CATEGORIES = [
  { id: "todos",        icon: "📚", label: "Todos" },
  { id: "catalogo",     icon: "📖", label: "Catálogo" },
  { id: "sistema",      icon: "⚙️", label: "Sistema" },
  { id: "fidelidade",   icon: "💎", label: "Fidelidade" },
  { id: "estoque",      icon: "📦", label: "Estoque" },
  { id: "kds",          icon: "🍳", label: "KDS / Cozinha" },
  { id: "impressora",   icon: "🖨️", label: "Impressora" },
  { id: "mesas",        icon: "🪑", label: "Mesas e Comandas" },
  { id: "delivery",     icon: "🚚", label: "Delivery" },
  { id: "caixa",        icon: "💰", label: "Caixa" },
  { id: "fiscal",       icon: "📄", label: "Fiscal" },
  { id: "financeiro",   icon: "💵", label: "Financeiro" },
  { id: "integracoes",  icon: "🔗", label: "Integrações" },
  { id: "cupons",       icon: "🎫", label: "Cupons & Descontos" },
];

const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
);

/**
 * 📌 Mapeamento oficial de qual vídeo vai em qual categoria
 */
const CATEGORY_OVERRIDES = {
  "Datas personalizadas.mp4": "sistema",
  "Chamado TUNA.mp4": "sistema",
  "Instação cardapinho (comprimido).mp4": "integracoes",
  "associar codigo interno com pdv do ifood.mp4": "integracoes",
  "reinstalar-o-cardapinho (comprimido).mp4": "integracoes",
  "sangria pagamento, financeiro..mp4": "financeiro",
};

/**
 * ✅ URLs estáticas dos seus vídeos
 *
 * Muito importante:
 * - O caminho abaixo é RELATIVO a este arquivo.
 *   Estamos em: src/components/VideoCenter.jsx
 *   Então pra ir até public/videos/arquivo.mp4 = "../../public/videos/arquivo.mp4"
 *
 * - Esses imports viram URLs válidas (com hash) geradas pelo Vite.
 *   Mesmo se o dev server não estiver servindo /videos/, vai funcionar.
 */
const STATIC_URL_OVERRIDES = {
  "Datas personalizadas.mp4": new URL(
    "../../public/videos/Datas personalizadas.mp4",
    import.meta.url
  ).href,
  "Chamado TUNA.mp4": new URL(
    "../../public/videos/Chamado TUNA.mp4",
    import.meta.url
  ).href,
  "Instação cardapinho (comprimido).mp4": new URL(
    "../../public/videos/Instação cardapinho (comprimido).mp4",
    import.meta.url
  ).href,
  "associar codigo interno com pdv do ifood.mp4": new URL(
    "../../public/videos/associar codigo interno com pdv do ifood.mp4",
    import.meta.url
  ).href,
  "reinstalar-o-cardapinho (comprimido).mp4": new URL(
    "../../public/videos/reinstalar-o-cardapinho (comprimido).mp4",
    import.meta.url
  ).href,
  "sangria pagamento, financeiro..mp4": new URL(
    "../../public/videos/sangria pagamento, financeiro..mp4",
    import.meta.url
  ).href,
};

/**
 * Esses são os vídeos que SEMPRE devem aparecer,
 * mesmo se manifest.json estiver 404.
 */
const HARDCODED_FILES = Object.keys(CATEGORY_OVERRIDES);

/**
 * Chute de categoria se algum vídeo no futuro não estiver no CATEGORY_OVERRIDES.
 * (Com o seu conjunto atual ele nem vai ser usado, mas deixei por segurança.)
 */
function guessCategory(name = "") {
  const lower = name.toLowerCase();
  if (lower.includes("fidelidade") || lower.includes("pontos")) return "fidelidade";
  if (lower.includes("estoque") || lower.includes("inventario")) return "estoque";
  if (lower.includes("kds") || lower.includes("cozinha")) return "kds";
  if (lower.includes("impress")) return "impressora";
  if (lower.includes("mesa") || lower.includes("comanda")) return "mesas";
  if (lower.includes("delivery") || lower.includes("ifood")) return "delivery";
  if (lower.includes("caixa") || lower.includes("abertura") || lower.includes("fechamento")) return "caixa";
  if (lower.includes("fiscal") || lower.includes("nota") || lower.includes("nf")) return "fiscal";
  if (lower.includes("financeiro") || lower.includes("sangria") || lower.includes("pagamento")) return "financeiro";
  if (lower.includes("integra") || lower.includes("pdv") || lower.includes("codigo interno") || lower.includes("código interno")) return "integracoes";
  return "sistema";
}

/**
 * Detecta mime-type por extensão
 */
function byExtToMime(name = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
  };
  return map[ext] || "video/*";
}

/**
 * Formata bytes em B / KB / MB / GB
 */
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

/**
 * Retorna a URL que vamos usar pro vídeo.
 * PRIORIDADE:
 * 1. STATIC_URL_OVERRIDES (garantido via import/new URL)
 * 2. /videos/<arquivo> (fallback, pra quando você fizer deploy e o servidor servir /public)
 */
function buildUrlFromPublic(name) {
  if (STATIC_URL_OVERRIDES[name]) {
    return STATIC_URL_OVERRIDES[name]; // 100% confiável no dev
  }

  // fallback (produção em servidor estático normal)
  const base = (import.meta?.env?.BASE_URL || "/").replace(/\/+$/, "/");
  const encoded = name
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `${base}videos/${encoded}`;
}

/**
 * Modal player em tela cheia
 */
function VideoModal({ isOpen, onClose, video }) {
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

  const catInfo = CATEGORY_MAP[video.category];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 mx-4 w-full max-w-4xl rounded-3xl bg-white/80 dark:bg-black/40 border border-purple-300/50 dark:border-purple-500/30 backdrop-blur-xl shadow-[0_8px_32px_rgba(139,92,246,0.3)] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Cabeçalho modal */}
        <div className="flex items-start justify-between p-6 border-b border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/80 backdrop-blur-lg">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white truncate">
              🎥 {video.name}
            </h3>

            {catInfo && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">
                  <span>{catInfo.icon}</span>
                  <span>{catInfo.label}</span>
                </span>
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="ml-4 px-4 py-2 bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white rounded-xl font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
          >
            Fechar (Esc)
          </button>
        </div>

        {/* Player */}
        <div className="flex-1 bg-black flex items-center justify-center">
          <video
            key={video.url}
            src={video.url}
            controls
            className="w-full h-full max-h-[70vh] object-contain"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Componente principal
 */
export default function VideoCenter() {
  // [{ name, url, previewUrl, size, type, category }]
  const [videos, setVideos] = useState([]);

  // estado de carregamento / erro
  const [loading, setLoading] = useState(true);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [error, setError] = useState("");

  // debug visível na tela
  const [debugInfo, setDebugInfo] = useState({
    base: "",
    manifestUrlTried: "",
    fetchStatus: "",
    manifestRaw: "",
    parsed: [],
    finalNames: [],
    notes: [],
  });

  // filtros
  const [selectedCategory, setSelectedCategory] = useState("todos");
  const [searchTerm, setSearchTerm] = useState("");

  // paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // modal
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerVideo, setViewerVideo] = useState(null);

  /**
   * 1. Carregar lista de vídeos
   *    - tenta manifest.json
   *    - junta fallback (HARDCODED_FILES)
   *    - aplica categorias e gera URL estável usando STATIC_URL_OVERRIDES
   */
  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      setLoading(true);
      setError("");

      const bust = Date.now();
      const base = (import.meta?.env?.BASE_URL || "/").replace(/\/+$/, "/");
      const manifestUrl = `${base}videos/manifest.json?ts=${bust}`;

      let manifestFiles = [];
      let manifestRaw = "";
      let fetchStatus = "";
      const notes = [];

      console.info("[VideoCenter] BASE_URL calculado:", base);
      console.info("[VideoCenter] manifestUrl:", manifestUrl);

      try {
        const res = await fetch(manifestUrl, { cache: "no-store" });
        fetchStatus = `${res.status} ${res.statusText}`;
        console.info("[VideoCenter] fetch manifest status:", fetchStatus);

        if (res.ok) {
          manifestRaw = await res.text();
          console.info("[VideoCenter] manifest RAW:", manifestRaw);

          try {
            const parsed = JSON.parse(manifestRaw);
            if (Array.isArray(parsed)) {
              manifestFiles = parsed;
              console.info("[VideoCenter] manifest PARSED (array ok):", parsed);
            } else {
              notes.push("manifest.json não é um array");
              console.warn("[VideoCenter] manifest não é array:", parsed);
            }
          } catch (parseErr) {
            notes.push("Erro ao fazer JSON.parse(manifest.json)");
            console.warn("[VideoCenter] Erro parse manifest:", parseErr);
          }
        } else {
          notes.push(`manifest.json status != 200 (${res.status})`);
          console.warn("[VideoCenter] manifest não OK, usando fallback");
        }
      } catch (err) {
        notes.push("Falha no fetch manifest.json (talvez 404 em dev)");
        console.warn("[VideoCenter] EXCEPTION fetch manifest.json:", err);
      }

      // Junta manifest + fallback fixo
      const uniqueSet = new Set([...(manifestFiles || []), ...HARDCODED_FILES]);

      // força todos os seus vídeos SEMPRE
      uniqueSet.add("Datas personalizadas.mp4");
      uniqueSet.add("Chamado TUNA.mp4");
      uniqueSet.add("Instação cardapinho (comprimido).mp4");
      uniqueSet.add("associar codigo interno com pdv do ifood.mp4");
      uniqueSet.add("reinstalar-o-cardapinho (comprimido).mp4");
      uniqueSet.add("sangria pagamento, financeiro..mp4");

      const finalNames = Array.from(uniqueSet);
      console.info("[VideoCenter] finalNames:", finalNames);

      // Monta objetos finais com url estável
      const list = finalNames.map((name) => {
        const forcedCategory = CATEGORY_OVERRIDES[name];
        const computedCategory = forcedCategory || guessCategory(name);

        const url = buildUrlFromPublic(name);

        return {
          name,
          url,
          previewUrl: `${url}?ts=${bust}`, // só pra miniatura, ok continuar
          size: null,
          type: byExtToMime(name),
          category: computedCategory,
        };
      });

      console.info("[VideoCenter] lista final (objetos):", list);

      if (!cancelled) {
        setVideos(list);
        setLoading(false);

        setDebugInfo({
          base,
          manifestUrlTried: manifestUrl,
          fetchStatus,
          manifestRaw,
          parsed: manifestFiles,
          finalNames,
          notes,
        });
      }
    }

    loadList();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 2. Descobrir tamanho dos vídeos via HEAD
   * OBS: alguns servidores de dev não respondem HEAD pra assets "importados"
   * então é normal vir null. Mas não quebra mais nada 👍
   */
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
            const lenRaw = r.headers.get("content-length");
            const len = Number(lenRaw);
            updated.push({
              ...v,
              size: Number.isFinite(len) ? len : null,
            });
          } catch (e) {
            console.warn("[VideoCenter] HEAD falhou p/ ", v.url, e);
            updated.push({ ...v, size: null });
          }
        }

        if (!cancelled) {
          setVideos(updated);
        }
      } finally {
        if (!cancelled) {
          setLoadingSizes(false);
        }
      }
    }

    loadSizes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos.length]);

  /**
   * Filtragem (categoria + busca)
   */
  const filteredVideos = useMemo(() => {
    let result = videos;

    if (selectedCategory !== "todos") {
      result = result.filter((v) => v.category === selectedCategory);
    }

    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      result = result.filter((v) => v.name.toLowerCase().includes(s));
    }

    return result;
  }, [videos, selectedCategory, searchTerm]);

  /**
   * Paginação
   */
  const totalPages = Math.ceil(filteredVideos.length / itemsPerPage || 1);

  const paginatedVideos = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredVideos.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredVideos, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, searchTerm, itemsPerPage]);

  /**
   * Soma total dos tamanhos
   */
  const totalSizeAllVideos = useMemo(() => {
    return videos.reduce((acc, v) => acc + (v.size || 0), 0);
  }, [videos]);

  /**
   * Contagem por categoria (badge)
   */
  const categoryCounts = useMemo(() => {
    const counts = {};
    CATEGORIES.forEach((cat) => {
      if (cat.id === "todos") {
        counts[cat.id] = videos.length;
      } else {
        counts[cat.id] = videos.filter((v) => v.category === cat.id).length;
      }
    });
    return counts;
  }, [videos]);

  /**
   * Baixar tudo em ZIP
   */
  async function downloadZip() {
    try {
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
    } catch (e) {
      console.error("[VideoCenter] Erro ao gerar ZIP:", e);
      setError("Falha ao baixar ZIP. Veja o console para detalhes.");
    }
  }

  function openViewer(v) {
    setViewerVideo(v);
    setViewerOpen(true);
  }

  function closeViewer() {
    setViewerOpen(false);
    setViewerVideo(null);
  }

  /**
   * RENDER
   */
  return (
    <section className="rounded-3xl p-8 border backdrop-blur-xl bg-white/80 dark:bg-black/40 border-purple-300/50 dark:border-purple-500/30 shadow-[0_8px_32px_rgba(139,92,246,0.2)] hover:shadow-[0_12px_48px_rgba(139,92,246,0.3)] transition-all duration-300 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex items-center gap-6 mb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-500 via-violet-600 to-purple-700 shadow-lg shadow-purple-500/30 border border-purple-400/30">
          <span className="text-3xl">🎥</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white">
            Central de Vídeos
          </h2>
          <p className="text-gray-600 dark:text-gray-300 text-lg mt-1">
            Biblioteca de vídeos de treinamento e materiais de suporte
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {VERSION}
          </p>
        </div>
      </div>

      {/* DEBUG BOX */}
      <details className="rounded-2xl border border-amber-400/40 dark:border-amber-400/30 bg-amber-50/70 dark:bg-amber-900/20 p-4 backdrop-blur-lg mb-6 text-xs text-amber-900 dark:text-amber-200">
        <summary className="cursor-pointer text-sm font-semibold text-amber-800 dark:text-amber-200">
          🔎 Debug técnico (abrir se não aparecerem vídeos)
        </summary>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div className="space-y-2">
            <div>
              <div className="font-semibold">BASE_URL calculado:</div>
              <div className="break-all">{debugInfo.base}</div>
            </div>
            <div>
              <div className="font-semibold">Manifest URL tentado:</div>
              <div className="break-all">{debugInfo.manifestUrlTried}</div>
            </div>
            <div>
              <div className="font-semibold">Status do fetch:</div>
              <div>{debugInfo.fetchStatus || "(vazio)"}</div>
            </div>
            <div>
              <div className="font-semibold">Notas:</div>
              <div className="break-all">
                {debugInfo.notes.join(" | ") || "(nenhuma)"}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <div className="font-semibold">manifest.json (raw):</div>
              <pre className="whitespace-pre-wrap break-all bg-black/60 text-white/90 p-2 rounded max-h-32 overflow-auto">
                {debugInfo.manifestRaw || "(vazio ou 404)"}
              </pre>
            </div>

            <div>
              <div className="font-semibold">manifest PARSED (array):</div>
              <pre className="whitespace-pre-wrap break-all bg-black/60 text-white/90 p-2 rounded max-h-32 overflow-auto">
                {JSON.stringify(debugInfo.parsed, null, 2)}
              </pre>
            </div>

            <div>
              <div className="font-semibold">Lista final (de nomes):</div>
              <pre className="whitespace-pre-wrap break-all bg-black/60 text-white/90 p-2 rounded max-h-32 overflow-auto">
                {JSON.stringify(debugInfo.finalNames, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        <div className="mt-4 text-[10px] text-amber-700 dark:text-amber-300">
          Se "Lista final (de nomes)" já mostra seus .mp4 mas a tabela lá embaixo
          estiver vazia, abre o DevTools (F12) → Console e vê se deu erro de
          runtime.
        </div>
      </details>

      {/* ERRO GLOBAL */}
      {error && (
        <div className="rounded-xl border border-red-300/60 dark:border-red-500/40 bg-red-100/80 dark:bg-red-600/20 text-red-700 dark:text-red-200 p-4 text-sm mb-6">
          {error}
        </div>
      )}

      {/* ESTADO LOADING / SEM VÍDEOS / CONTEÚDO PRINCIPAL */}
      {loading ? (
        <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-8 backdrop-blur-lg text-center">
          <div className="w-12 h-12 border-4 border-purple-200 dark:border-purple-700 border-t-purple-600 dark:border-t-purple-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">
            Carregando lista de vídeos...
          </p>
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-8 backdrop-blur-lg text-center">
          <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📂</span>
          </div>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
            Nenhum vídeo encontrado
          </h3>
          <p className="text-gray-600 dark:text-gray-300 text-sm max-w-md mx-auto leading-relaxed">
            Verifique se os nomes batem exatamente (incluindo acentos e vírgulas)
            com os arquivos dentro de public/videos.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* BARRA DE PESQUISA / ITENS POR PÁGINA */}
          <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-2xl">🔍</span>
                <input
                  type="text"
                  placeholder="Pesquisar vídeos por nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 px-4 py-3 text-base rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white dark:bg-slate-700 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="px-4 py-3 rounded-xl bg-gray-200 dark:bg-slate-600 hover:bg-gray-300 dark:hover:bg-slate-500 text-gray-700 dark:text-white transition-all text-sm font-medium"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                  Itens por página:
                </label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="px-3 py-2 text-base rounded-lg border border-purple-300/50 dark:border-purple-500/30 bg-white dark:bg-slate-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                </select>
              </div>
            </div>
          </div>

          {/* CATEGORIAS */}
          <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <span>📂</span>
              <span>Categorias</span>
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border ${
                    selectedCategory === cat.id
                      ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white border-purple-500 shadow-lg transform scale-105"
                      : "bg-white/60 dark:bg-slate-700/60 text-gray-700 dark:text-gray-200 border-purple-300/50 dark:border-purple-500/30 hover:bg-purple-50 dark:hover:bg-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate flex items-center gap-2">
                      <span className="text-base">{cat.icon}</span>
                      <span>{cat.label}</span>
                    </span>

                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        selectedCategory === cat.id
                          ? "bg-white/20 text-white"
                          : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                      }`}
                    >
                      {categoryCounts[cat.id] || 0}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* INFO RÁPIDA */}
          <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-4 backdrop-blur-lg">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Mostrando{" "}
                <strong>{paginatedVideos.length}</strong> de{" "}
                <strong>{filteredVideos.length}</strong> vídeos
                {searchTerm && (
                  <span> (filtrado de {videos.length} total)</span>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {loadingSizes
                  ? "Calculando tamanhos..."
                  : `Tamanho total (todos os vídeos): ${humanSize(
                      totalSizeAllVideos
                    )}`}
              </div>
            </div>
          </div>

          {/* LISTA DE VÍDEOS */}
          {filteredVideos.length === 0 ? (
            <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-8 backdrop-blur-lg text-center">
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔍</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
                Nenhum vídeo encontrado
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Ajuste os filtros ou a pesquisa
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg">
              <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30">
                <table className="w-full text-sm">
                  <thead className="bg-purple-100/80 dark:bg-slate-700/60">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-800 dark:text-white border-r border-gray-200/50 dark:border-gray-600/50">
                        Arquivo
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-800 dark:text-white border-r border-gray-200/50 dark:border-gray-600/50 w-40">
                        Categoria
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-800 dark:text-white border-r border-gray-200/50 dark:border-gray-600/50 w-24">
                        Tamanho
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-800 dark:text-white w-80">
                        Ações
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedVideos.map((v, idx) => {
                      const catInfo = CATEGORY_MAP[v.category];
                      return (
                        <tr
                          key={idx}
                          className="border-t border-gray-200/50 dark:border-gray-600/50 hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors"
                        >
                          {/* Nome + URL */}
                          <td className="px-4 py-4 border-r border-gray-200/50 dark:border-gray-600/50 align-top">
                            <button
                              onClick={() => openViewer(v)}
                              className="font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:underline text-left"
                              title="Assistir vídeo"
                            >
                              {v.name}
                            </button>
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 break-all mt-1 max-w-md">
                              {v.url}
                            </div>
                          </td>

                          {/* Categoria */}
                          <td className="px-4 py-4 border-r border-gray-200/50 dark:border-gray-600/50 text-gray-700 dark:text-gray-200 align-top">
                            {catInfo ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[11px] font-medium">
                                <span>{catInfo.icon}</span>
                                <span>{catInfo.label}</span>
                              </span>
                            ) : (
                              <span className="text-xs italic text-gray-500 dark:text-gray-400">
                                (sem categoria)
                              </span>
                            )}
                          </td>

                          {/* Tamanho */}
                          <td className="px-4 py-4 border-r border-gray-200/50 dark:border-gray-600/50 text-gray-700 dark:text-gray-200 font-medium align-top">
                            {loadingSizes ? (
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                                <span className="text-xs">...</span>
                              </div>
                            ) : (
                              humanSize(v.size)
                            )}
                          </td>

                          {/* Ações */}
                          <td className="px-4 py-4 align-top">
                            <div className="flex items-start gap-3 flex-wrap">
                              {/* Baixar */}
                              <a
                                href={v.url}
                                download={v.name}
                                className="inline-flex items-center gap-2 rounded-lg bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white px-3 py-2 text-xs font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
                              >
                                📥 Baixar
                              </a>

                              {/* Assistir */}
                              <button
                                onClick={() => openViewer(v)}
                                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white px-3 py-2 text-xs font-medium transition-all duration-200 shadow-lg"
                              >
                                ▶️ Assistir
                              </button>

                              {/* Mini-preview */}
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
                                />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAGINAÇÃO */}
          {totalPages > 1 && (
            <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  Página <strong>{currentPage}</strong> de{" "}
                  <strong>{totalPages}</strong>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      currentPage === 1
                        ? "bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-700 text-white"
                    }`}
                  >
                    Primeira
                  </button>

                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={currentPage === 1}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      currentPage === 1
                        ? "bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-700 text-white"
                    }`}
                  >
                    ← Anterior
                  </button>

                  <div className="hidden md:flex items-center gap-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${
                            currentPage === pageNum
                              ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg"
                              : "bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-slate-600 border border-purple-300/50 dark:border-purple-500/30"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() =>
                      setCurrentPage((prev) =>
                        Math.min(totalPages, prev + 1)
                      )
                    }
                    disabled={currentPage === totalPages}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      currentPage === totalPages
                        ? "bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-700 text-white"
                    }`}
                  >
                    Próxima →
                  </button>

                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      currentPage === totalPages
                        ? "bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-700 text-white"
                    }`}
                  >
                    Última
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* RODAPÉ / BAIXAR TUDO */}
          <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-gray-600 dark:text-gray-300">
                <span className="text-sm">
                  📊 <strong>{videos.length}</strong> vídeos disponíveis
                  {totalSizeAllVideos > 0 && (
                    <>
                      {" "}
                      •{" "}
                      <strong>{humanSize(totalSizeAllVideos)}</strong> total
                    </>
                  )}
                </span>
              </div>

              <button
                onClick={downloadZip}
                disabled={!videos.length || loadingSizes}
                className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all duration-300 ${
                  !videos.length || loadingSizes
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

      {/* MODAL PLAYER */}
      <VideoModal
        isOpen={viewerOpen}
        onClose={closeViewer}
        video={viewerVideo}
      />
    </section>
  );
}
