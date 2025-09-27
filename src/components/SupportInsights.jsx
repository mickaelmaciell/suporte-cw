import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";

/**
 * Painel de Insights do Suporte (CSV) - seguindo o layout das Ferramentas CW
 */

/* ========= CATEGORIAS DE ASSUNTO ========= */
const SUBJECT_KEYWORDS = {
  "Fiscal/SEFAZ": [
    "sefaz","sat","mfe","nfce","nfc-e","csc","certificado digital","contingencia","contingência",
    "xml","autorização","inutilização","protocolo","retorno sefaz","mensageria"
  ],
  "Pix": ["pix","chave pix","pagamento pix","qr code pix","pix copia e cola","psp","qr"],
  "WhatsApp": ["whatsapp","zap","wpp","whats","canal whatsapp","bot whatsapp","template"],
  "Impressora": [
    "impressora","nao imprime","não imprime","cupom fiscal","bobina","spool","impressao","impressão",
    "epson","bematech","elgin","daruma","termica","térmica","driver impressão","bluetooth"
  ],
  "Pagamentos/Chargeback": [
    "pagamento","checkout","chargeback","estorno","refund","refundo","cartao","cartão","nsu","tef"
  ],
  "Financeiro": [
    "boleto","fatura","financeiro","cobrança","cobranca","nota fiscal","nf-e","nfe","conciliacao","conciliação"
  ],
  "Integrações": [
    "integracao","integração","ifood","mercado pago","pagseguro","gateway","crm","erp","webhook","api","oauth"
  ],
  "Marketplace/E-commerce": [
    "marketplace","magalu","mercado livre","b2w","shopee","amazon","loja virtual","ecommerce","e-commerce","pedido"
  ],
  "Estoque/Inventário": [
    "estoque","inventario","inventário","saldo","romaneio","deposito","depósito","transferencia","transferência"
  ],
  "Cadastro/Produtos": [
    "cadastro","produto","preco","preço","categoria","sku","variacao","variação","grade","ean","barcode"
  ],
  "Relatórios": [
    "relatorio","relatório","dashboard","indicadores","kpi","metrica","métrica","grafico","gráfico","csv","export"
  ],
  "Usuário/Acesso": [
    "usuario","usuário","permissao","permissão","perfil","acesso","bloqueio","2fa","mfa","sessao","sessão"
  ],
  "Atualização/Versão": [
    "atualizacao","atualização","update","versao","versão","release","patch","hotfix","changelog"
  ],
  "Backup/Sincronização": [
    "backup","restaurar","restore","sincronizacao","sincronização","sync","replicacao","replicação","offline"
  ],
  "Sistema/Aplicação": [
    "tela","lentidao","lentidão","travando","bug","erro sistema","congelou","crash","timeout","excecao","exceção",
    "login","senha","memoria","memória","cache","configuracao","configuração"
  ],
  "Rede/Conexão": [
    "rede","internet","wi-fi","wifi","conexao","conexão","dns","proxy","vpn","porta","latencia","latência"
  ],
  "Hardware/PDV": [
    "pdv","leitor","scanner","gaveta","balanca","balança","teclado","mouse","display","monitor","usb","ser","serial"
  ],
  "E-mail/Notificações": [
    "email","e-mail","notificacao","notificação","smtp","inbox","spam","bounce","dkim","spf","webhook email"
  ],
  "Segurança/Antivírus": [
    "antivirus","antivírus","firewall","bloqueio","seguranca","segurança","permitir app","whitelist","porta bloqueada"
  ],
  "Banco de Dados": [
    "banco de dados","postgres","mysql","sql","replicação","timeout banco","consulta lenta","otimizacao","otimização"
  ],
  "Treinamento/Dúvidas": [
    "duvida","dúvida","como fazer","tutorial","treinamento","manual","onboarding","passo a passo"
  ],
  "Entregas/Logística": [
    "entrega","frete","logistica","logística","transportadora","rastreamento","coleta"
  ],
  "Exportação/Importação de Dados": [
    "exportar","export","exportação","exportacao","importar","import","importação","importacao",
    "planilha","excel","xls","xlsx","csv","baixar dados","subir planilha","migração","migracao"
  ],
};

/* ==================== UTILS ==================== */
function heuristicDelimiterDetect(sampleText = "") {
  const candidates = [",", ";", "\t", "|"];
  const counts = candidates.map((d) => ({
    d,
    n: (sampleText.match(new RegExp(`\\${d}`, "g")) || []).length,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0]?.d || ",";
}

function norm(s = "") {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function humanNumber(n = 0) {
  return new Intl.NumberFormat("pt-BR").format(n);
}

function computeCategory(subject = "") {
  const text = norm(subject);
  for (const [cat, kws] of Object.entries(SUBJECT_KEYWORDS)) {
    if (kws.some((kw) => text.includes(norm(kw)))) return cat;
  }
  return "Outros";
}

function matchRow(row, terms, searchInClient) {
  if (terms.length === 0) return true;
  const subj = norm(row?.subject);
  const cli = norm(row?.cliente);
  return terms.every((t) => subj.includes(t) || (searchInClient && cli.includes(t)));
}

const PREFERRED_COLUMNS = [
  "subject", "cliente", "atendente", "squad", "session_id",
  "first_reply_time", "waiting_time", "resolution_time", "total_interactions",
  "csat_answer", "fcr_answer",
];

// Componente Modal customizado
const CustomModal = ({ isOpen, onClose, title, children, size = "max-w-7xl" }) => {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 mx-4 w-full ${size} rounded-3xl bg-white/80 dark:bg-black/40 border border-purple-300/50 dark:border-purple-500/30 backdrop-blur-xl shadow-[0_8px_32px_rgba(139,92,246,0.3)] max-h-[90vh] flex flex-col`}>
        <div className="flex items-start justify-between p-6 border-b border-purple-300/50 dark:border-purple-500/30 sticky top-0 bg-white/90 dark:bg-slate-800/80 backdrop-blur-lg rounded-t-3xl z-10">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="ml-4 px-4 py-2 bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white rounded-xl font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
          >
            Fechar (Esc)
          </button>
        </div>
        <div className="p-6 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

/* ==================== COMPONENTE PRINCIPAL ==================== */
export default function SupportInsights() {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  // busca
  const [search, setSearch] = useState("");
  const [searchInClient, setSearchInClient] = useState(false);

  // filtro por categoria via clique
  const [selectedCategory, setSelectedCategory] = useState(null);

  // UI: paginação e "ver Outros"
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showOutros, setShowOutros] = useState(false);

  // Ranking CSAT / combinado
  const [csatRankValue, setCsatRankValue] = useState(5); // 5..1
  const [combinedSortBy, setCombinedSortBy] = useState("fcr_rate");
  const [combinedSortDir, setCombinedSortDir] = useState("desc");

  // Painel "Categorias visíveis"
  const [visibleCats, setVisibleCats] = useState(null); // null => todas
  const allCatsFromKeywords = useMemo(() => Object.keys(SUBJECT_KEYWORDS).concat("Outros"), []);
  const visibleSet = useMemo(() => new Set(visibleCats ?? allCatsFromKeywords), [visibleCats, allCatsFromKeywords]);

  // MODAL por categoria
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState(null);
  const [modalFilter, setModalFilter] = useState({ csatNote: null, fcr: null });
  const [modalPage, setModalPage] = useState(1);
  const [modalPageSize, setModalPageSize] = useState(25);

  const inputRef = useRef(null);

  /* =============== CSV Loader =============== */
  async function handleFile(e) {
    setError("");
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setPage(1);
    setSelectedCategory(null);
    setShowOutros(false);

    try {
      const firstChunk = await f.slice(0, 4096).text();
      const fallbackDelimiter = heuristicDelimiterDetect(firstChunk);

      Papa.parse(f, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
        complete: (res) => {
          const first = res.data?.[0] || {};
          const cols = Object.keys(first);
          const needsRetry = cols.length <= 1 && fallbackDelimiter !== ",";

          if (needsRetry) {
            Papa.parse(f, {
              header: true,
              dynamicTyping: false,
              skipEmptyLines: true,
              delimiter: fallbackDelimiter,
              complete: (res2) => setRows(res2.data || []),
              error: () => setError("Não consegui ler o CSV (fallback)."),
            });
          } else {
            setRows(res.data || []);
          }
        },
        error: () => {
          Papa.parse(f, {
            header: true,
            dynamicTyping: false,
            skipEmptyLines: true,
            delimiter: fallbackDelimiter,
            complete: (res2) => setRows(res2.data || []),
            error: () => setError("Não consegui ler o CSV."),
          });
        },
      });
    } catch {
      setError("Falha ao processar arquivo.");
    }
  }

  function reset() {
    setRows([]);
    setFileName("");
    setError("");
    setSearch("");
    setSearchInClient(false);
    setSelectedCategory(null);
    setShowOutros(false);
    setPage(1);
    setCsatRankValue(5);
    setCombinedSortBy("fcr_rate");
    setCombinedSortDir("desc");
    setVisibleCats(null);
    setModalOpen(false);
    setModalCategory(null);
    setModalFilter({ csatNote: null, fcr: null });
    setModalPage(1);
    if (inputRef.current) inputRef.current.value = "";
  }

  /* =============== Pré-processamento =============== */
  const rowsWithCat = useMemo(() => {
    if (!rows.length) return [];
    return rows.map((r) => ({ ...r, _cat: computeCategory(r?.subject) }));
  }, [rows]);

  const filteredBySearch = useMemo(() => {
    const terms = norm(search).split(/\s+/).filter(Boolean);
    return rowsWithCat.filter((r) => matchRow(r, terms, searchInClient));
  }, [rowsWithCat, search, searchInClient]);

  const filteredByVisible = useMemo(() => {
    return filteredBySearch.filter((r) => visibleSet.has(r._cat || "Outros"));
  }, [filteredBySearch, visibleSet]);

  const filteredRows = useMemo(() => {
    if (!selectedCategory) return filteredByVisible;
    return filteredByVisible.filter((r) => r._cat === selectedCategory);
  }, [filteredByVisible, selectedCategory]);

  const categoryMap = useMemo(() => {
    const m = new Map();
    for (const r of filteredBySearch) {
      const cat = r._cat || "Outros";
      if (!visibleSet.has(cat)) continue;
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat).push(r);
    }
    return m;
  }, [filteredBySearch, visibleSet]);

  const categoryAgg = useMemo(() => {
    return Array.from(categoryMap.entries())
      .map(([label, list]) => ({ label, count: list.length }))
      .sort((a, b) => b.count - a.count);
  }, [categoryMap]);

  const clientAgg = useMemo(() => {
    const map = new Map();
    for (const r of filteredRows) {
      const key = (r?.cliente ?? "").toString().trim();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  /* =============== CSAT & FCR por categoria =============== */
  const perCategoryQuality = useMemo(() => {
    const stats = new Map();
    const get = (cat) => {
      if (!stats.has(cat)) {
        stats.set(cat, {
          total: 0, csatCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, csatMissing: 0, fcrTrue: 0, fcrFalse: 0,
        });
      }
      return stats.get(cat);
    };
    for (const r of filteredByVisible) {
      const cat = r._cat || "Outros";
      const s = get(cat);
      s.total += 1;

      const cs = Number(r?.csat_answer);
      if (!Number.isFinite(cs) || cs < 1 || cs > 5) s.csatMissing += 1;
      else s.csatCounts[cs] += 1;

      const f = String(r?.fcr_answer ?? "").toLowerCase().trim();
      if (f === "true") s.fcrTrue += 1;
      else if (f === "false") s.fcrFalse += 1;
    }
    const out = [];
    for (const [cat, s] of stats.entries()) {
      const csatSum = 1 * s.csatCounts[1] + 2 * s.csatCounts[2] + 3 * s.csatCounts[3] + 4 * s.csatCounts[4] + 5 * s.csatCounts[5];
      const csatN = s.csatCounts[1] + s.csatCounts[2] + s.csatCounts[3] + s.csatCounts[4] + s.csatCounts[5];
      const csatAvg = csatN > 0 ? csatSum / csatN : null;
      const fcrDen = s.fcrTrue + s.fcrFalse;
      const fcrRate = fcrDen > 0 ? s.fcrTrue / fcrDen : null;
      out.push({ category: cat, ...s, csatAvg, fcrRate });
    }
    return out.sort((a, b) => b.total - a.total);
  }, [filteredByVisible]);

  const csatSelectedRanking = useMemo(() => {
    const note = Number(csatRankValue);
    const arr = perCategoryQuality.map((s) => ({
      category: s.category,
      count: s.csatCounts[note] ?? 0,
      total: s.total,
      csatMissing: s.csatMissing,
      csatCounts: s.csatCounts,
    })).sort((a, b) => b.count - a.count);
    const missingTotal = perCategoryQuality.reduce((acc, s) => acc + s.csatMissing, 0);
    return { arr, missingTotal };
  }, [perCategoryQuality, csatRankValue]);

  const fcrTrueRanking = useMemo(() => {
    return perCategoryQuality.map((s) => ({ category: s.category, count: s.fcrTrue, total: s.total }))
      .sort((a, b) => b.count - a.count);
  }, [perCategoryQuality]);

  const fcrFalseRanking = useMemo(() => {
    return perCategoryQuality.map((s) => ({ category: s.category, count: s.fcrFalse, total: s.total }))
      .sort((a, b) => b.count - a.count);
  }, [perCategoryQuality]);

  const combinedRanking = useMemo(() => {
    const sel = Number(csatRankValue);
    let arr = perCategoryQuality.map((s) => ({
      category: s.category,
      fcr_rate: s.fcrRate,
      csat_avg: s.csatAvg,
      csat_sel: s.csatCounts[sel] ?? 0,
      total: s.total,
    }));
    const dir = combinedSortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const va = a[combinedSortBy], vb = b[combinedSortBy];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        if (va === vb) return (b.total - a.total) * dir;
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb)) * dir;
    });
    return arr;
  }, [perCategoryQuality, csatRankValue, combinedSortBy, combinedSortDir]);

  function toggleCombinedSort(col) {
    if (col === combinedSortBy) setCombinedSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setCombinedSortBy(col); setCombinedSortDir("desc"); }
  }

  /* =============== Lista (todos os atendimentos) =============== */
  const availableCols = useMemo(() => {
    if (!filteredRows.length) return [];
    const present = Object.keys(filteredRows[0]);
    const preferred = PREFERRED_COLUMNS.filter((c) => present.includes(c));
    return ["_cat", ...preferred];
  }, [filteredRows]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, totalPages);
  const start = (curPage - 1) * pageSize;
  const pageRows = filteredRows.slice(start, start + pageSize);

  function exportCSV(rowsToExport, name) {
    const csv = Papa.unparse(rowsToExport, { delimiter: ";" });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportFilteredCSV() {
    if (!filteredRows.length) return;
    const clone = filteredRows.map(({ _cat, ...rest }) => ({ categoria: _cat, ...rest }));
    exportCSV(clone, "atendimentos_filtrados.csv");
  }

  const topCatCount = categoryAgg[0]?.count || 0;
  const topClientCount = clientAgg[0]?.count || 0;

  /* ======== Modal por categoria ======== */
  function openCategoryModal(cat, opts = {}) {
    setModalCategory(cat);
    setModalFilter({
      csatNote: Number.isFinite(opts.csatNote) ? Number(opts.csatNote) : null,
      fcr: opts.fcr === "true" || opts.fcr === "false" ? opts.fcr : null,
    });
    setModalPage(1);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setModalCategory(null);
    setModalFilter({ csatNote: null, fcr: null });
  }

  const modalRowsAll = useMemo(() => {
    if (!modalCategory) return [];
    const base = filteredByVisible.filter((r) => (r._cat || "Outros") === modalCategory);
    const withCsat = modalFilter.csatNote != null
      ? base.filter((r) => Number(r?.csat_answer) === Number(modalFilter.csatNote))
      : base;
    const withFcr = modalFilter.fcr
      ? withCsat.filter((r) => String(r?.fcr_answer ?? "").toLowerCase().trim() === modalFilter.fcr)
      : withCsat;
    return withFcr;
  }, [filteredByVisible, modalCategory, modalFilter]);

  const modalTotal = modalRowsAll.length;
  const modalTotalPages = Math.max(1, Math.ceil(modalTotal / modalPageSize));
  const modalCurPage = Math.min(modalPage, modalTotalPages);
  const modalStart = (modalCurPage - 1) * modalPageSize;
  const modalRows = modalRowsAll.slice(modalStart, modalStart + modalPageSize);

  const modalSummary = useMemo(() => {
    if (!modalCategory) return null;
    const total = modalRowsAll.length;
    const fcrTrue = modalRowsAll.filter((r) => String(r?.fcr_answer ?? "").toLowerCase().trim() === "true").length;
    const fcrFalse = modalRowsAll.filter((r) => String(r?.fcr_answer ?? "").toLowerCase().trim() === "false").length;
    const fcrDen = fcrTrue + fcrFalse;
    const fcrRateText = fcrDen ? `${((fcrTrue / fcrDen) * 100).toFixed(1)}%` : "-";

    const csCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, miss: 0 };
    modalRowsAll.forEach((r) => {
      const n = Number(r?.csat_answer);
      if (Number.isFinite(n) && n >= 1 && n <= 5) csCounts[n] += 1;
      else csCounts.miss += 1;
    });
    const nResp = csCounts[1] + csCounts[2] + csCounts[3] + csCounts[4] + csCounts[5];
    const sum = 1 * csCounts[1] + 2 * csCounts[2] + 3 * csCounts[3] + 4 * csCounts[4] + 5 * csCounts[5];
    const csatAvgText = nResp ? (sum / nResp).toFixed(2) : "-";
    const pct = (n) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "-");

    return {
      total, fcrTrue, fcrFalse, fcrRateText, csatAvgText, csCounts,
      pctAll: {
        5: pct(csCounts[5]), 4: pct(csCounts[4]), 3: pct(csCounts[3]),
        2: pct(csCounts[2]), 1: pct(csCounts[1]), miss: pct(csCounts.miss)
      }
    };
  }, [modalCategory, modalRowsAll]);

  /* =============== UI =============== */
  return (
    <section className="rounded-3xl p-8 border backdrop-blur-xl bg-white/80 dark:bg-black/40 border-purple-300/50 dark:border-purple-500/30 shadow-[0_8px_32px_rgba(139,92,246,0.2)] hover:shadow-[0_12px_48px_rgba(139,92,246,0.3)] transition-all duration-300">
      {/* Header */}
      <div className="flex items-center gap-6 mb-10">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-500 via-violet-600 to-purple-700 shadow-lg shadow-purple-500/30 border border-purple-400/30">
          <span className="text-3xl">📊</span>
        </div>
        <div className="flex-1">
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white">
            Insights do Suporte (CSV)
          </h2>
          <p className="text-gray-600 dark:text-gray-300 text-lg mt-2">
            Envie a planilha exportada (mínimo: <code className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-500/30 text-purple-600 dark:text-purple-400">subject</code> e <code className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-500/30 text-purple-600 dark:text-purple-400">cliente</code>).
          </p>
          {!!filteredRows.length && (
            <div className="text-sm text-gray-600 dark:text-gray-300 mt-2">
              <strong>Registros (após filtro):</strong> {humanNumber(total)}
              {fileName && <> • <strong>Arquivo:</strong> {fileName}</>}
            </div>
          )}
        </div>
      </div>

      {/* Upload & Filtro */}
      <div className="rounded-2xl p-1 bg-gradient-to-r from-purple-200/40 dark:from-purple-500/20 via-violet-200/30 dark:via-violet-500/20 to-purple-200/40 dark:to-purple-500/20 mb-10">
        <div className="p-8 rounded-xl bg-white/90 dark:bg-slate-800/80 backdrop-blur-lg">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-6">📁 Upload & Filtro</h3>
          
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFile}
                    className="w-full text-base file:mr-4 file:py-4 file:px-8 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-gradient-to-r file:from-purple-600 file:to-violet-600 file:text-white hover:file:from-purple-700 hover:file:to-violet-700 file:transition-all file:cursor-pointer file:shadow-lg bg-gray-50 dark:bg-slate-700/60 border border-purple-300/50 dark:border-purple-500/30 rounded-xl text-gray-800 dark:text-white backdrop-blur-lg"
                  />
                </div>
                <button
                  onClick={reset}
                  className="px-8 py-4 bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white rounded-xl font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
                >
                  🗑️ Limpar
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Pesquisar palavra-chave
                </label>
                <input
                  type="text"
                  placeholder="Ex.: pix impressora fatura"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-gray-50 dark:bg-slate-700/60 px-4 py-3 text-gray-800 dark:text-white text-base font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 backdrop-blur-lg"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={searchInClient}
                  onChange={(e) => { setSearchInClient(e.target.checked); setPage(1); }}
                  className="rounded"
                />
                Buscar também no campo <strong>cliente</strong>
              </label>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300/60 dark:border-red-500/40 bg-red-100/80 dark:bg-red-600/20 text-red-700 dark:text-red-200 p-4 text-sm mb-6">
          {error}
        </div>
      )}

      {/* Painel: Categorias visíveis */}
      <details className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg mb-6">
        <summary className="cursor-pointer font-medium text-gray-800 dark:text-white text-lg">
          🎯 Categorias visíveis (marque/desmarque)
        </summary>
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setVisibleCats(allCatsFromKeywords)}
              className="px-4 py-2 bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white rounded-lg font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
            >
              Selecionar todas
            </button>
            <button
              onClick={() => setVisibleCats([])}
              className="px-4 py-2 bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white rounded-lg font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
            >
              Limpar todas
            </button>
            <button
              onClick={() => setVisibleCats(null)}
              className="px-4 py-2 bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white rounded-lg font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
              title="Usar padrão (todas as categorias)"
            >
              Padrão
            </button>
          </div>

          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
            {allCatsFromKeywords.map((c) => {
              const checked = visibleSet.has(c);
              return (
                <label key={c} className="inline-flex items-center gap-3 text-sm bg-gray-100/80 dark:bg-slate-700/40 rounded-lg px-4 py-3 border border-gray-300/50 dark:border-slate-600/30 hover:bg-gray-200/80 dark:hover:bg-slate-600/40 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setVisibleCats((prev) => {
                        let next = new Set(prev ?? allCatsFromKeywords);
                        if (e.target.checked) next.add(c);
                        else next.delete(c);
                        return Array.from(next);
                      });
                    }}
                    className="rounded"
                  />
                  <span className="text-gray-700 dark:text-gray-200 font-medium">{c}</span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Este painel afeta a Distribuição, Rankings, Combinado e Lista.
          </p>
        </div>
      </details>

      {/* DISTRIBUIÇÃO POR CATEGORIA */}
      <details className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg mb-6" open>
        <summary className="cursor-pointer font-medium text-gray-800 dark:text-white text-lg">
          📈 Distribuição por assunto (categorias)
        </summary>
        {!filteredByVisible.length ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            Envie um CSV (e/ou selecione categorias) para ver dados.
          </p>
        ) : (
          <div className="mt-6">
            <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 backdrop-blur-lg">
              <table className="w-full text-sm">
                <thead className="bg-purple-100/80 dark:bg-slate-700/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white">Categoria</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white w-32">Qtde</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white">Distribuição</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white w-40">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryAgg.map((row, idx) => {
                    const isOutros = row.label === "Outros";
                    const pct = topCatCount > 0 ? (row.count / topCatCount) * 100 : 0;
                    return (
                      <tr key={idx} className="border-t border-gray-200/50 dark:border-gray-600/50 hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors">
                        <td
                          className="px-4 py-3 text-purple-600 dark:text-purple-400 hover:underline cursor-pointer font-medium"
                          onClick={() => openCategoryModal(row.label)}
                          title="Ver atendimentos desta categoria"
                        >
                          {row.label}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                          {humanNumber(row.count)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-3 flex-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-600"
                                style={{ width: `${pct}%` }}
                                title={`${Math.round(pct)}% do topo`}
                              />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-12">
                              {Math.round(pct)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => { setSelectedCategory(row.label); setShowOutros(false); setPage(1); }}
                              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${selectedCategory === row.label
                                ? "bg-purple-600 text-white border border-purple-600"
                                : "bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white border border-gray-300 dark:border-slate-500/30"
                                }`}
                            >
                              {selectedCategory === row.label ? "Filtrando..." : "Filtrar"}
                            </button>
                            {isOutros && (
                              <button
                                onClick={() => { setSelectedCategory(null); setShowOutros((v) => !v); }}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white border border-gray-300 dark:border-slate-500/30 transition-all duration-200"
                              >
                                {showOutros ? "Ocultar Outros" : "Ver Outros"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {showOutros && categoryMap.get("Outros")?.length > 0 && (
                <div className="border-t border-gray-200/50 dark:border-gray-600/50 p-4 bg-gray-50/80 dark:bg-slate-700/40">
                  <div className="text-sm font-medium text-gray-800 dark:text-white mb-4">
                    Itens classificados como <strong>Outros</strong>: {humanNumber(categoryMap.get("Outros").length)}
                  </div>
                  <div className="overflow-auto rounded-lg border border-gray-300/50 dark:border-gray-600/50 bg-white dark:bg-slate-800">
                    <table className="min-w-[800px] w-full text-sm">
                      <thead className="bg-gray-100 dark:bg-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200">subject</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200">cliente</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200">atendente</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200">squad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryMap.get("Outros").slice(0, 100).map((r, i) => (
                          <tr key={i} className="border-t border-gray-200/50 dark:border-gray-600/50">
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{String(r?.subject ?? "")}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{String(r?.cliente ?? "")}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{String(r?.atendente ?? "")}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{String(r?.squad ?? "")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Mostrando até 100 itens de "Outros".</p>
                </div>
              )}
            </div>

            {(selectedCategory || showOutros) && (
              <div className="mt-4">
                <button
                  onClick={() => { setSelectedCategory(null); setShowOutros(false); setPage(1); }}
                  className="px-4 py-2 bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white rounded-lg font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
                >
                  Limpar filtro de categoria
                </button>
              </div>
            )}
          </div>
        )}
      </details>

      {/* RANKING POR CSAT */}
      <details className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg mb-6">
        <summary className="cursor-pointer font-medium text-gray-800 dark:text-white text-lg">
          ⭐ Ranking por CSAT (nota)
        </summary>
        {!filteredByVisible.length ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">Envie um CSV (ou selecione categorias).</p>
        ) : (
          <div className="mt-6">
            <div className="flex items-center gap-4 mb-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Nota:</label>
              <select
                value={csatRankValue}
                onChange={(e) => setCsatRankValue(Number(e.target.value))}
                className="rounded-lg border border-purple-300/50 dark:border-purple-500/30 bg-gray-50 dark:bg-slate-700/60 px-3 py-2 text-gray-800 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Sem nota (total): <strong className="text-gray-700 dark:text-gray-200">{humanNumber(csatSelectedRanking.missingTotal)}</strong>
              </span>
            </div>

            <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 backdrop-blur-lg">
              <table className="w-full text-sm">
                <thead className="bg-purple-100/80 dark:bg-slate-700/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white">Categoria</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white w-40">Qtd. nota {csatRankValue}</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white">% sobre total da categoria</th>
                  </tr>
                </thead>
                <tbody>
                  {csatSelectedRanking.arr.map((row, idx) => {
                    const info = perCategoryQuality.find((s) => s.category === row.category);
                    const totalCat = info?.total ?? 0;
                    const pctVal = totalCat > 0 ? (row.count / totalCat) * 100 : 0;

                    const t5 = info?.csatCounts[5] ?? 0, t4 = info?.csatCounts[4] ?? 0,
                      t3 = info?.csatCounts[3] ?? 0, t2 = info?.csatCounts[2] ?? 0,
                      t1 = info?.csatCounts[1] ?? 0, tm = info?.csatMissing ?? 0;
                    const p = (n) => (totalCat > 0 ? ((n / totalCat) * 100).toFixed(1) + "%" : "-");
                    const tooltip =
                      `CSAT por ${row.category}
5: ${t5} (${p(t5)})
4: ${t4} (${p(t4)})
3: ${t3} (${p(t3)})
2: ${t2} (${p(t2)})
1: ${t1} (${p(t1)})
Sem nota: ${tm} (${p(tm)})`;

                    return (
                      <tr key={idx} className="border-t border-gray-200/50 dark:border-gray-600/50 hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors">
                        <td
                          className="px-4 py-3 text-purple-600 dark:text-purple-400 hover:underline cursor-pointer font-medium"
                          onClick={() => openCategoryModal(row.category, { csatNote: csatRankValue })}
                          title="Ver atendimentos desta categoria (apenas desta nota)"
                        >
                          {row.category}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                          {humanNumber(row.count)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-3 flex-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" title={tooltip}>
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500"
                                style={{ width: `${pctVal}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-12">
                              {pctVal.toFixed(1)}%
                            </span>
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
      </details>

      {/* RANKING POR FCR */}
      <details className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg mb-6">
        <summary className="cursor-pointer font-medium text-gray-800 dark:text-white text-lg">
          ✅ Ranking por FCR (resolvido x não resolvido)
        </summary>
        {!filteredByVisible.length ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">Envie um CSV (ou selecione categorias).</p>
        ) : (
          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 backdrop-blur-lg">
              <div className="px-4 py-3 border-b border-gray-200/50 dark:border-gray-600/50 text-sm font-medium bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-200">
                FCR = true (Resolvidos)
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-100/80 dark:bg-slate-700/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white">Categoria</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white w-20">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {fcrTrueRanking.map((row, idx) => (
                    <tr key={idx} className="border-t border-gray-200/50 dark:border-gray-600/50 hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors">
                      <td
                        className="px-4 py-3 text-purple-600 dark:text-purple-400 hover:underline cursor-pointer font-medium"
                        onClick={() => openCategoryModal(row.category, { fcr: "true" })}
                      >
                        {row.category}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                        {humanNumber(row.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 backdrop-blur-lg">
              <div className="px-4 py-3 border-b border-gray-200/50 dark:border-gray-600/50 text-sm font-medium bg-red-100/80 dark:bg-red-900/30 text-red-700 dark:text-red-200">
                FCR = false (Não resolvidos)
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-100/80 dark:bg-slate-700/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white">Categoria</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white w-20">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {fcrFalseRanking.map((row, idx) => (
                    <tr key={idx} className="border-t border-gray-200/50 dark:border-gray-600/50 hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors">
                      <td
                        className="px-4 py-3 text-purple-600 dark:text-purple-400 hover:underline cursor-pointer font-medium"
                        onClick={() => openCategoryModal(row.category, { fcr: "false" })}
                      >
                        {row.category}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                        {humanNumber(row.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </details>

      {/* RANKING COMBINADO */}
      <details className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg mb-6">
        <summary className="cursor-pointer font-medium text-gray-800 dark:text-white text-lg">
          🔄 Ranking COMBINADO (FCR & CSAT)
        </summary>
        {!filteredByVisible.length ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">Envie um CSV (ou selecione categorias).</p>
        ) : (
          <div className="mt-6">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Ordene clicando no cabeçalho. Padrão: <strong>% FCR True</strong> (desc). Nota atual: <strong>{csatRankValue}</strong>.
            </p>
            <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 backdrop-blur-lg">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-purple-100/80 dark:bg-slate-700/60">
                  <tr>
                    {[
                      ["category", "Categoria"],
                      ["fcr_rate", "% FCR True"],
                      ["csat_avg", "CSAT Médio"],
                      ["csat_sel", `Qtd CSAT ${csatRankValue}`],
                      ["total", "Total"],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleCombinedSort(key)}
                        className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white cursor-pointer select-none hover:bg-purple-200/50 dark:hover:bg-slate-600/50 transition-colors"
                        title="Clique para ordenar"
                      >
                        {label}
                        {combinedSortBy === key && (
                          <span className="ml-1">
                            {combinedSortDir === "asc" ? "▲" : "▼"}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {combinedRanking.map((r, i) => (
                    <tr key={i} className="border-t border-gray-200/50 dark:border-gray-600/50 hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors">
                      <td
                        className="px-4 py-3 text-purple-600 dark:text-purple-400 hover:underline cursor-pointer font-medium"
                        onClick={() => openCategoryModal(r.category)}
                      >
                        {r.category}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                        {r.fcr_rate == null ? "-" : (r.fcr_rate * 100).toFixed(1) + "%"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                        {r.csat_avg == null ? "-" : r.csat_avg.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                        {humanNumber(r.csat_sel)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                        {humanNumber(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </details>

      {/* RANKING DE CLIENTES */}
      <details className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg mb-6">
        <summary className="cursor-pointer font-medium text-gray-800 dark:text-white text-lg">
          👥 Ranking de clientes mais atendidos
        </summary>
        {!filteredRows.length ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">Envie um CSV (e/ou aplique um filtro).</p>
        ) : (
          <div className="mt-6">
            <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 backdrop-blur-lg">
              <table className="w-full text-sm">
                <thead className="bg-purple-100/80 dark:bg-slate-700/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white w-16">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white">Cliente</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white w-32">Qtde</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white">Distribuição</th>
                  </tr>
                </thead>
                <tbody>
                  {clientAgg.slice(0, 20).map((row, idx) => {
                    const pct = topClientCount > 0 ? (row.count / topClientCount) * 100 : 0;
                    return (
                      <tr key={idx} className="border-t border-gray-200/50 dark:border-gray-600/50 hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors">
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">{idx + 1}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">{row.label}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                          {humanNumber(row.count)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-3 flex-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-12">
                              {Math.round(pct)}%
                            </span>
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
      </details>

      {/* LISTA COMPLETA */}
      <details className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg mb-6">
        <summary className="cursor-pointer font-medium text-gray-800 dark:text-white text-lg">
          📋 Lista de atendimentos (filtrados)
        </summary>
        {!filteredRows.length ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">Nenhum registro para exibir.</p>
        ) : (
          <div className="mt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
              <div className="text-sm text-gray-700 dark:text-gray-200">
                Página <strong>{curPage}</strong> de <strong>{totalPages}</strong> • Registros: <strong>{humanNumber(total)}</strong>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <label className="hidden md:inline text-gray-600 dark:text-gray-300">Itens por página:</label>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(+e.target.value || 25); setPage(1); }}
                  className="rounded-lg border border-purple-300/50 dark:border-purple-500/30 bg-gray-50 dark:bg-slate-700/60 px-3 py-2 text-gray-800 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <button
                  onClick={exportFilteredCSV}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-all duration-200 border border-purple-600"
                >
                  📥 Exportar (.csv)
                </button>
              </div>
            </div>

            <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 backdrop-blur-lg">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-purple-100/80 dark:bg-slate-700/60">
                  <tr>
                    {availableCols.map((c) => (
                      <th key={c} className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white">
                        {c === "_cat" ? "Categoria" : c.replaceAll("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-200/50 dark:border-gray-600/50 hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors">
                      {availableCols.map((c) => (
                        <td key={c} className="px-4 py-3 text-gray-700 dark:text-gray-200">
                          {c === "_cat" ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openCategoryModal(r._cat)}
                                className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900/30 px-3 py-1 text-xs font-medium text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30 hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors"
                              >
                                {r._cat}
                              </button>
                              {r._cat !== "Outros" && (
                                <button
                                  onClick={() => { setSelectedCategory(r._cat); setPage(1); }}
                                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                                >
                                  filtrar
                                </button>
                              )}
                            </div>
                          ) : (
                            String(r?.[c] ?? "")
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={curPage <= 1}
                className={`rounded-lg px-4 py-2 font-medium transition-all duration-200 ${curPage <= 1
                    ? "bg-gray-200 dark:bg-slate-600/40 text-gray-500 dark:text-slate-400 cursor-not-allowed"
                    : "bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white border border-gray-300 dark:border-slate-500/30"
                  }`}
              >
                ← Anterior
              </button>
              <div className="text-gray-600 dark:text-gray-300">
                Página <strong>{curPage}</strong> de <strong>{totalPages}</strong>
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={curPage >= totalPages}
                className={`rounded-lg px-4 py-2 font-medium transition-all duration-200 ${curPage >= totalPages
                    ? "bg-gray-200 dark:bg-slate-600/40 text-gray-500 dark:text-slate-400 cursor-not-allowed"
                    : "bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white border border-gray-300 dark:border-slate-500/30"
                  }`}
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </details>

      {/* MODAL POR CATEGORIA */}
      <CustomModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={
          <div>
            Atendimentos - <span className="text-purple-600 dark:text-purple-400">{modalCategory}</span>
            {modalSummary && (
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-300 flex flex-wrap gap-4">
                <span>Total: <strong className="text-gray-800 dark:text-white">{humanNumber(modalSummary.total)}</strong></span>
                <span>FCR True: <strong className="text-gray-800 dark:text-white">{humanNumber(modalSummary.fcrTrue)}</strong></span>
                <span>FCR False: <strong className="text-gray-800 dark:text-white">{humanNumber(modalSummary.fcrFalse)}</strong></span>
                <span>%FCR: <strong className="text-gray-800 dark:text-white">{modalSummary.fcrRateText}</strong></span>
                <span>CSAT Médio: <strong className="text-gray-800 dark:text-white">{modalSummary.csatAvgText}</strong></span>
              </div>
            )}
            {(modalFilter.csatNote != null || modalFilter.fcr) && (
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {modalFilter.csatNote != null && (
                  <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-300">
                    Filtro: CSAT = <strong>{modalFilter.csatNote}</strong>
                    <button
                      className="ml-1 text-blue-600 dark:text-blue-400 hover:underline"
                      onClick={() => { setModalFilter((f) => ({ ...f, csatNote: null })); setModalPage(1); }}
                    >
                      ✕
                    </button>
                  </span>
                )}
                {modalFilter.fcr && (
                  <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                    Filtro: FCR = <strong>{modalFilter.fcr}</strong>
                    <button
                      className="ml-1 text-emerald-600 dark:text-emerald-400 hover:underline"
                      onClick={() => { setModalFilter((f) => ({ ...f, fcr: null })); setModalPage(1); }}
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        }
      >
        <div className="space-y-6">
          {/* Controles do Modal */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-gray-700 dark:text-gray-200">
              Página <strong>{modalCurPage}</strong> de <strong>{modalTotalPages}</strong> • Registros: <strong>{humanNumber(modalTotal)}</strong>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={modalPageSize}
                onChange={(e) => { setModalPageSize(+e.target.value || 25); setModalPage(1); }}
                className="rounded-lg border border-purple-300/50 dark:border-purple-500/30 bg-gray-50 dark:bg-slate-700/60 px-3 py-2 text-gray-800 dark:text-white text-sm font-medium focus:outline-none"
              >
                {[10, 25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button
                onClick={() => {
                  const clone = modalRowsAll.map(({ _cat, ...rest }) => ({ categoria: _cat, ...rest }));
                  exportCSV(clone, `atendimentos_${modalCategory}.csv`);
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-all duration-200"
              >
                📥 Exportar CSV
              </button>
            </div>
          </div>

          {/* Tabela do Modal */}
          <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 backdrop-blur-lg max-h-[60vh]">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-purple-100/80 dark:bg-slate-700/60 sticky top-0">
                <tr>
                  {["_cat", "subject", "cliente", "atendente", "squad", "session_id", "csat_answer", "fcr_answer", "first_reply_time", "waiting_time", "resolution_time", "total_interactions"].map((c) => (
                    <th key={c} className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-white border-r border-gray-200 dark:border-gray-600 last:border-r-0">
                      {c === "_cat" ? "Categoria" : c.replaceAll("_", " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modalRows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-200/50 dark:border-gray-600/50 hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors">
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{r._cat}</td>
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{String(r?.subject ?? "")}</td>
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{String(r?.cliente ?? "")}</td>
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{String(r?.atendente ?? "")}</td>
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{String(r?.squad ?? "")}</td>
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{String(r?.session_id ?? "")}</td>
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{String(r?.csat_answer ?? "")}</td>
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{String(r?.fcr_answer ?? "")}</td>
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{String(r?.first_reply_time ?? "")}</td>
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{String(r?.waiting_time ?? "")}</td>
                    <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{String(r?.resolution_time ?? "")}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{String(r?.total_interactions ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação do Modal */}
          <div className="flex items-center justify-between text-sm">
            <button
              onClick={() => setModalPage((p) => Math.max(1, p - 1))}
              disabled={modalCurPage <= 1}
              className={`rounded-lg px-4 py-2 font-medium transition-all duration-200 ${modalCurPage <= 1
                  ? "bg-gray-200 dark:bg-slate-600/40 text-gray-500 dark:text-slate-400 cursor-not-allowed"
                  : "bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white border border-gray-300 dark:border-slate-500/30"
                }`}
            >
              ← Anterior
            </button>
            <div className="text-gray-600 dark:text-gray-300">
              Página <strong>{modalCurPage}</strong> de <strong>{modalTotalPages}</strong>
            </div>
            <button
              onClick={() => setModalPage((p) => Math.min(modalTotalPages, p + 1))}
              disabled={modalCurPage >= modalTotalPages}
              className={`rounded-lg px-4 py-2 font-medium transition-all duration-200 ${modalCurPage >= modalTotalPages
                  ? "bg-gray-200 dark:bg-slate-600/40 text-gray-500 dark:text-slate-400 cursor-not-allowed"
                  : "bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white border border-gray-300 dark:border-slate-500/30"
                }`}
            >
              Próxima →
            </button>
          </div>
        </div>
      </CustomModal>
    </section>
  );
}