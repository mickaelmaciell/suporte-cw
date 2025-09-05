// src/components/SupportInsights.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";

/**
 * Painel de Insights do Suporte (CSV) — tema escuro/vidro roxo
 * - Upload CSV (mínimo: subject, cliente)
 * - Busca normalizada (subject e opcional cliente)
 * - Categorias (ampliadas) + painel "Categorias visíveis" (checkboxes)
 * - Distribuição por assunto, Ranking de clientes
 * - Ranking por CSAT (nota) com tooltip de TODAS as notas
 * - Ranking por FCR (true/false)
 * - Ranking combinado (FCR & CSAT) com ordenação
 * - Lista completa com paginação + export
 * - Modal sobreposta por categoria (altura limitada, scroll interno, paginação, export)
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
  const cli  = norm(row?.cliente);
  return terms.every((t) => subj.includes(t) || (searchInClient && cli.includes(t)));
}
const PREFERRED_COLUMNS = [
  "subject","cliente","atendente","squad","session_id",
  "first_reply_time","waiting_time","resolution_time","total_interactions",
  "csat_answer","fcr_answer",
];

/* ==================== COMPONENTE ==================== */
export default function SupportInsights() {
  // ======= tema helpers (mesmo do restante) =======
  const card =
    "rounded-2xl border border-[#9D00FF]/30 bg-black/40 backdrop-blur-lg p-6 md:p-8 shadow-[0_0_20px_rgba(157,0,255,0.25)] text-white";
  const sectionBox = "rounded-xl border border-gray-700 bg-gray-900/40 p-3 md:p-4";
  const tableWrap = "rounded-xl border border-gray-700 overflow-hidden bg-gray-900/40";
  const thHead = "bg-gray-800/60";
  const btn =
    "rounded-lg border border-gray-700 px-3 py-1.5 text-sm hover:bg-gray-800/60 text-gray-200";
  const inputBase =
    "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#9D00FF]/40";
  const selectBase =
    "rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#9D00FF]/40";

  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  // busca
  const [search, setSearch] = useState("");
  const [searchInClient, setSearchInClient] = useState(false);

  // filtro por categoria via clique
  const [selectedCategory, setSelectedCategory] = useState(null);

  // UI: paginação e “ver Outros”
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

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") closeModal(); }
    if (modalOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

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
    setRows([]); setFileName(""); setError("");
    setSearch(""); setSearchInClient(false);
    setSelectedCategory(null); setShowOutros(false);
    setPage(1); setCsatRankValue(5);
    setCombinedSortBy("fcr_rate"); setCombinedSortDir("desc");
    setVisibleCats(null);
    setModalOpen(false); setModalCategory(null);
    setModalFilter({ csatNote: null, fcr: null }); setModalPage(1);
    if (inputRef.current) inputRef.current.value = "";
  }

  /* =============== Pré-processamento: categorias, busca e painel de visibilidade =============== */
  const rowsWithCat = useMemo(() => {
    if (!rows.length) return [];
    return rows.map((r) => ({ ...r, _cat: computeCategory(r?.subject) }));
  }, [rows]);

  const filteredBySearch = useMemo(() => {
    const terms = norm(search).split(/\s+/).filter(Boolean);
    return rowsWithCat.filter((r) => matchRow(r, terms, searchInClient));
  }, [rowsWithCat, search, searchInClient]);

  // aplica painel "Categorias visíveis"
  const filteredByVisible = useMemo(() => {
    return filteredBySearch.filter((r) => visibleSet.has(r._cat || "Outros"));
  }, [filteredBySearch, visibleSet]);

  const filteredRows = useMemo(() => {
    if (!selectedCategory) return filteredByVisible;
    return filteredByVisible.filter((r) => r._cat === selectedCategory);
  }, [filteredByVisible, selectedCategory]);

  // mapa categoria -> linhas (no conjunto filtrado por busca + visibilidade)
  const categoryMap = useMemo(() => {
    const m = new Map();
    for (const r of filteredBySearch) {
      const cat = r._cat || "Outros";
      if (!visibleSet.has(cat)) continue; // respeita visibilidade
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
          total: 0, csatCounts: {1:0,2:0,3:0,4:0,5:0}, csatMissing: 0, fcrTrue: 0, fcrFalse: 0,
        });
      }
      return stats.get(cat);
    };
    for (const r of filteredByVisible) {
      const cat = r._cat || "Outros";
      const s = get(cat); s.total += 1;

      const cs = Number(r?.csat_answer);
      if (!Number.isFinite(cs) || cs < 1 || cs > 5) s.csatMissing += 1;
      else s.csatCounts[cs] += 1;

      const f = String(r?.fcr_answer ?? "").toLowerCase().trim();
      if (f === "true") s.fcrTrue += 1;
      else if (f === "false") s.fcrFalse += 1;
    }
    const out = [];
    for (const [cat, s] of stats.entries()) {
      const csatSum = 1*s.csatCounts[1]+2*s.csatCounts[2]+3*s.csatCounts[3]+4*s.csatCounts[4]+5*s.csatCounts[5];
      const csatN = s.csatCounts[1]+s.csatCounts[2]+s.csatCounts[3]+s.csatCounts[4]+s.csatCounts[5];
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
      fcr_rate: s.fcrRate, csat_avg: s.csatAvg,
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
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
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

    const csCounts = {1:0,2:0,3:0,4:0,5:0, miss:0};
    modalRowsAll.forEach((r)=>{
      const n = Number(r?.csat_answer);
      if (Number.isFinite(n) && n>=1 && n<=5) csCounts[n] += 1;
      else csCounts.miss += 1;
    });
    const nResp = csCounts[1]+csCounts[2]+csCounts[3]+csCounts[4]+csCounts[5];
    const sum = 1*csCounts[1]+2*csCounts[2]+3*csCounts[3]+4*csCounts[4]+5*csCounts[5];
    const csatAvgText = nResp ? (sum/nResp).toFixed(2) : "-";
    const pct = (n) => (total > 0 ? `${((n/total)*100).toFixed(1)}%` : "-");

    return {
      total, fcrTrue, fcrFalse, fcrRateText, csatAvgText, csCounts,
      pctAll: { 5:pct(csCounts[5]), 4:pct(csCounts[4]), 3:pct(csCounts[3]),
                2:pct(csCounts[2]), 1:pct(csCounts[1]), miss:pct(csCounts.miss) }
    };
  }, [modalCategory, modalRowsAll]);

  /* =============== UI =============== */
  return (
    <section className={card}>
      <header className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold">Insights do Suporte (CSV)</h2>
          <p className="text-sm text-gray-300">
            Envie a planilha exportada (mínimo: <code className="px-1 rounded bg-gray-900 border border-gray-700">subject</code> e <code className="px-1 rounded bg-gray-900 border border-gray-700">cliente</code>).
          </p>
        </div>
        {!!filteredRows.length && (
          <div className="text-sm text-gray-300">
            <b>Registros (após filtro):</b> {humanNumber(total)}
            {fileName ? <> • <b>Arquivo:</b> {fileName}</> : null}
          </div>
        )}
      </header>

      {/* Upload + Busca */}
      <details className={`${sectionBox}`} open>
        <summary className="cursor-pointer font-medium text-white">Upload & Filtro</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2 flex items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className={inputBase}
            />
            <button onClick={reset} className={btn}>Limpar</button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white">Pesquisar palavra-chave</label>
            <input
              type="text"
              placeholder='Ex.: pix impressora fatura'
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className={inputBase}
            />
            <label className="inline-flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={searchInClient}
                onChange={(e) => { setSearchInClient(e.target.checked); setPage(1); }}
              />
              Buscar também no campo <b>cliente</b>
            </label>
          </div>
        </div>
      </details>

      {/* Painel: Categorias visíveis */}
      <details className={`${sectionBox}`} open={false}>
        <summary className="cursor-pointer font-medium text-white">Categorias visíveis (marque/desmarque)</summary>
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-3">
            <button className={btn} onClick={() => setVisibleCats(allCatsFromKeywords)}>
              Selecionar todas
            </button>
            <button className={btn} onClick={() => setVisibleCats([])}>
              Limpar todas
            </button>
            <button className={btn} onClick={() => setVisibleCats(null)} title="Usar padrão (todas as categorias)">
              Padrão
            </button>
          </div>

          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-2">
            {allCatsFromKeywords.map((c) => {
              const checked = visibleSet.has(c);
              return (
                <label key={c} className="inline-flex items-center gap-2 text-sm border border-gray-700 bg-gray-900/60 rounded-md px-3 py-2">
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
                  />
                  <span className="text-gray-200">{c}</span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Este painel afeta a Distribuição, Rankings, Combinado e Lista.
          </p>
        </div>
      </details>

      {error && (
        <div className="rounded-xl border border-rose-600/40 bg-rose-900/20 text-rose-200 p-3 text-sm">
          {error}
        </div>
      )}

      {/* DISTRIBUIÇÃO POR CATEGORIA */}
      <details className={`${sectionBox}`} open={false}>
        <summary className="cursor-pointer font-medium text-white">Distribuição por assunto (categorias)</summary>
        {!filteredByVisible.length ? (
          <p className="mt-2 text-sm text-gray-300">Envie um CSV (e/ou selecione categorias) para ver dados.</p>
        ) : (
          <div className={`${tableWrap} mt-3`}>
            <table className="w-full text-sm">
              <thead className={thHead}>
                <tr>
                  <th className="px-3 py-2 text-left">Categoria</th>
                  <th className="px-3 py-2 text-left w-56">Qtde</th>
                  <th className="px-3 py-2 text-left">Gráfico</th>
                  <th className="px-3 py-2 text-left w-40">Ações</th>
                </tr>
              </thead>
              <tbody>
                {categoryAgg.map((row, idx) => {
                  const isOutros = row.label === "Outros";
                  const pct = topCatCount > 0 ? (row.count / topCatCount) * 100 : 0;
                  return (
                    <tr key={idx} className="odd:bg-gray-800/30 even:bg-gray-900/20">
                      <td
                        className="px-3 py-2 border-r border-gray-700 text-[#B84CFF] hover:underline cursor-pointer"
                        onClick={() => openCategoryModal(row.label)}
                        title="Ver atendimentos desta categoria"
                      >
                        {row.label}
                      </td>
                      <td className="px-3 py-2 border-r border-gray-700 text-gray-200">{humanNumber(row.count)}</td>
                      <td className="px-3 py-2">
                        <div className="h-2 w-full rounded bg-gray-700 overflow-hidden">
                          <div
                            className="h-full"
                            style={{ width: `${pct}%`, background: "linear-gradient(90deg,#9D00FF,#B84CFF)" }}
                            title={`${Math.round(pct)}% do topo`}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => { setSelectedCategory(row.label); setShowOutros(false); setPage(1); }}
                            className={`rounded-md px-3 py-1.5 text-xs border ${
                              selectedCategory === row.label
                                ? "bg-[#9D00FF] text-white border-[#9D00FF]"
                                : "border-gray-700 hover:bg-gray-800/60 text-gray-200"
                            }`}
                          >
                            {selectedCategory === row.label ? "Filtrando..." : "Filtrar"}
                          </button>
                          {isOutros && (
                            <button
                              onClick={() => { setSelectedCategory(null); setShowOutros((v) => !v); }}
                              className={btn + " text-xs"}
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
              <div className="border-t border-gray-700 p-3 space-y-2 bg-gray-900/40">
                <div className="text-sm font-medium text-white">
                  Itens classificados como <b>Outros</b>: {humanNumber(categoryMap.get("Outros").length)}
                </div>
                <div className={`${tableWrap}`}>
                  <table className="min-w-[800px] w-full text-sm">
                    <thead className={thHead}>
                      <tr>
                        <th className="px-3 py-2 text-left">subject</th>
                        <th className="px-3 py-2 text-left">cliente</th>
                        <th className="px-3 py-2 text-left">atendente</th>
                        <th className="px-3 py-2 text-left">squad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryMap.get("Outros").slice(0, 100).map((r, i) => (
                        <tr key={i} className="odd:bg-gray-800/30 even:bg-gray-900/20">
                          <td className="px-3 py-2 border-t border-gray-700">{String(r?.subject ?? "")}</td>
                          <td className="px-3 py-2 border-t border-gray-700">{String(r?.cliente ?? "")}</td>
                          <td className="px-3 py-2 border-t border-gray-700">{String(r?.atendente ?? "")}</td>
                          <td className="px-3 py-2 border-t border-gray-700">{String(r?.squad ?? "")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400">Mostrando até 100 itens de “Outros”.</p>
              </div>
            )}
          </div>
        )}

        {(selectedCategory || showOutros) && (
          <div className="mt-3">
            <button
              onClick={() => { setSelectedCategory(null); setShowOutros(false); setPage(1); }}
              className={btn + " text-xs"}
            >
              Limpar filtro de categoria
            </button>
          </div>
        )}
      </details>

      {/* RANKING POR CSAT (nota) */}
      <details className={`${sectionBox}`} open={false}>
        <summary className="cursor-pointer font-medium text-white">Ranking por CSAT (nota)</summary>
        {!filteredByVisible.length ? (
          <p className="mt-2 text-sm text-gray-300">Envie um CSV (ou selecione categorias).</p>
        ) : (
          <>
            <div className="mt-2 flex items-center gap-3">
              <label className="text-sm text-gray-200">Nota:</label>
              <select
                value={csatRankValue}
                onChange={(e) => setCsatRankValue(Number(e.target.value))}
                className={selectBase}
              >
                {[5,4,3,2,1].map((n)=> <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-xs text-gray-400">
                Sem nota (total): <b className="text-gray-200">{humanNumber(csatSelectedRanking.missingTotal)}</b>
              </span>
            </div>

            <div className={`${tableWrap} mt-3`}>
              <table className="w-full text-sm">
                <thead className={thHead}>
                  <tr>
                    <th className="px-3 py-2 text-left">Categoria</th>
                    <th className="px-3 py-2 text-left w-56">Qtd. nota {csatRankValue}</th>
                    <th className="px-3 py-2 text-left">% sobre total da categoria</th>
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
                      <tr key={idx} className="odd:bg-gray-800/30 even:bg-gray-900/20">
                        <td
                          className="px-3 py-2 border-r border-gray-700 text-[#B84CFF] hover:underline cursor-pointer"
                          onClick={() => openCategoryModal(row.category, { csatNote: csatRankValue })}
                          title="Ver atendimentos desta categoria (apenas desta nota)"
                        >
                          {row.category}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-700 text-gray-200">{humanNumber(row.count)}</td>
                        <td className="px-3 py-2">
                          <div className="h-2 w-full rounded bg-gray-700 overflow-hidden" title={tooltip}>
                            <div
                              className="h-full"
                              style={{ width: `${pctVal}%`, background: "linear-gradient(90deg,#4F46E5,#22D3EE)" }}
                            />
                          </div>
                          <div className="text-xs text-gray-300 mt-1">{pctVal.toFixed(1)}%</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </details>

      {/* RANKING POR FCR */}
      <details className={`${sectionBox}`} open={false}>
        <summary className="cursor-pointer font-medium text-white">Ranking por FCR (resolvido x não resolvido)</summary>
        {!filteredByVisible.length ? (
          <p className="mt-2 text-sm text-gray-300">Envie um CSV (ou selecione categorias).</p>
        ) : (
          <div className="mt-3 grid md:grid-cols-2 gap-4">
            <div className={`${tableWrap}`}>
              <div className="px-3 py-2 border-b border-gray-700 text-sm font-medium bg-emerald-900/30 text-emerald-200">
                FCR = true (Resolvidos)
              </div>
              <table className="w-full text-sm">
                <thead className={thHead}>
                  <tr><th className="px-3 py-2 text-left">Categoria</th><th className="px-3 py-2 text-left w-56">Qtd</th></tr>
                </thead>
                <tbody>
                  {fcrTrueRanking.map((row, idx) => (
                    <tr key={idx} className="odd:bg-gray-800/30 even:bg-gray-900/20">
                      <td
                        className="px-3 py-2 border-r border-gray-700 text-[#B84CFF] hover:underline cursor-pointer"
                        onClick={() => openCategoryModal(row.category, { fcr: "true" })}
                      >
                        {row.category}
                      </td>
                      <td className="px-3 py-2 text-gray-200">{humanNumber(row.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={`${tableWrap}`}>
              <div className="px-3 py-2 border-b border-gray-700 text-sm font-medium bg-rose-900/30 text-rose-200">
                FCR = false (Não resolvidos)
              </div>
              <table className="w-full text-sm">
                <thead className={thHead}>
                  <tr><th className="px-3 py-2 text-left">Categoria</th><th className="px-3 py-2 text-left w-56">Qtd</th></tr>
                </thead>
                <tbody>
                  {fcrFalseRanking.map((row, idx) => (
                    <tr key={idx} className="odd:bg-gray-800/30 even:bg-gray-900/20">
                      <td
                        className="px-3 py-2 border-r border-gray-700 text-[#B84CFF] hover:underline cursor-pointer"
                        onClick={() => openCategoryModal(row.category, { fcr: "false" })}
                      >
                        {row.category}
                      </td>
                      <td className="px-3 py-2 text-gray-200">{humanNumber(row.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </details>

      {/* RANKING COMBINADO */}
      <details className={`${sectionBox}`} open={false}>
        <summary className="cursor-pointer font-medium text-white">Ranking COMBINADO (FCR & CSAT)</summary>
        {!filteredByVisible.length ? (
          <p className="mt-2 text-sm text-gray-300">Envie um CSV (ou selecione categorias).</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-gray-400">
              Ordene clicando no cabeçalho. Padrão: <b>% FCR True</b> (desc). Nota atual: <b>{csatRankValue}</b>.
            </p>
            <div className={`${tableWrap} mt-3 overflow-auto`}>
              <table className="min-w-[760px] w-full text-sm">
                <thead className={thHead}>
                  <tr>
                    {[
                      ["category","Categoria"],
                      ["fcr_rate","% FCR True"],
                      ["csat_avg","CSAT Médio"],
                      ["csat_sel",`Qtd CSAT ${csatRankValue}`],
                      ["total","Total"],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleCombinedSort(key)}
                        className="px-3 py-2 text-left capitalize cursor-pointer select-none"
                        title="Clique para ordenar"
                      >
                        <span className="text-white">
                          {label}{combinedSortBy === key ? (combinedSortDir === "asc" ? " ▲" : " ▼") : ""}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {combinedRanking.map((r, i) => (
                    <tr key={i} className="odd:bg-gray-800/30 even:bg-gray-900/20">
                      <td
                        className="px-3 py-2 border-t border-gray-700 text-[#B84CFF] hover:underline cursor-pointer"
                        onClick={() => openCategoryModal(r.category)}
                      >
                        {r.category}
                      </td>
                      <td className="px-3 py-2 border-t border-gray-700 text-gray-200">
                        {r.fcr_rate == null ? "-" : (r.fcr_rate*100).toFixed(1)+"%"}
                      </td>
                      <td className="px-3 py-2 border-t border-gray-700 text-gray-200">
                        {r.csat_avg == null ? "-" : r.csat_avg.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 border-t border-gray-700 text-gray-200">{humanNumber(r.csat_sel)}</td>
                      <td className="px-3 py-2 border-t border-gray-700 text-gray-200">{humanNumber(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </details>

      {/* RANKING DE CLIENTES */}
      <details className={`${sectionBox}`} open={false}>
        <summary className="cursor-pointer font-medium text-white">Ranking de clientes mais atendidos</summary>
        {!filteredRows.length ? (
          <p className="mt-2 text-sm text-gray-300">Envie um CSV (e/ou aplique um filtro).</p>
        ) : (
          <div className={`${tableWrap} mt-3`}>
            <table className="w-full text-sm">
              <thead className={thHead}>
                <tr>
                  <th className="px-3 py-2 text-left w-16">#</th>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left w-56">Qtde</th>
                  <th className="px-3 py-2 text-left">Gráfico</th>
                </tr>
              </thead>
              <tbody>
                {clientAgg.map((row, idx) => {
                  const pct = topClientCount > 0 ? (row.count / topClientCount) * 100 : 0;
                  return (
                    <tr key={idx} className="odd:bg-gray-800/30 even:bg-gray-900/20">
                      <td className="px-3 py-2 border-r border-gray-700 text-gray-200">{idx + 1}</td>
                      <td className="px-3 py-2 border-r border-gray-700 text-gray-200">{row.label}</td>
                      <td className="px-3 py-2 border-r border-gray-700 text-gray-200">{humanNumber(row.count)}</td>
                      <td className="px-3 py-2">
                        <div className="h-2 w-full rounded bg-gray-700 overflow-hidden">
                          <div
                            className="h-full"
                            style={{ width: `${pct}%`, background: "linear-gradient(90deg,#10B981,#34D399)" }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      {/* LISTA COMPLETA */}
      <details className={`${sectionBox}`} open={false}>
        <summary className="cursor-pointer font-medium text-white">Lista de atendimentos (filtrados)</summary>
        {!filteredRows.length ? (
          <p className="mt-2 text-sm text-gray-300">Nenhum registro para exibir.</p>
        ) : (
          <>
            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap text-gray-200">
              <div className="text-sm">
                Página <b>{curPage}</b> de <b>{totalPages}</b> • Registros: <b>{humanNumber(total)}</b>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <label className="hidden md:inline text-gray-300">Itens por página:</label>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(+e.target.value || 25); setPage(1); }}
                  className={selectBase}
                >
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <button onClick={exportFilteredCSV} className={btn}>
                  Exportar filtro (.csv)
                </button>
              </div>
            </div>

            <div className={`${tableWrap} mt-3 overflow-auto`}>
              <table className="min-w-[1100px] w-full text-sm">
                <thead className={thHead}>
                  <tr>
                    {availableCols.map((c) => (
                      <th key={c} className="px-3 py-2 text-left capitalize">
                        {c === "_cat" ? "Categoria" : c.replaceAll("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={i} className="odd:bg-gray-800/30 even:bg-gray-900/20">
                      {availableCols.map((c) => (
                        <td key={c} className="px-3 py-2 border-t border-gray-700 text-gray-200">
                          {c === "_cat" ? (
                            <span className="inline-flex items-center gap-2">
                              <button
                                onClick={() => openCategoryModal(r._cat)}
                                className="rounded-full bg-gray-800 px-2 py-0.5 text-xs border border-gray-700 text-[#B84CFF] hover:underline"
                              >
                                {r._cat}
                              </button>
                              {r._cat !== "Outros" && (
                                <button
                                  onClick={() => { setSelectedCategory(r._cat); setPage(1); }}
                                  className="text-xs text-[#B84CFF] hover:underline"
                                >
                                  filtrar por esta
                                </button>
                              )}
                            </span>
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

            <div className="mt-3 flex items-center justify-between text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={curPage <= 1}
                className={`rounded-md px-3 py-1.5 border border-gray-700 ${
                  curPage <= 1 ? "text-gray-500" : "hover:bg-gray-800/60 text-gray-200"
                }`}
              >
                Anterior
              </button>
              <div className="text-gray-300">Página <b>{curPage}</b> de <b>{totalPages}</b></div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={curPage >= totalPages}
                className={`rounded-md px-3 py-1.5 border border-gray-700 ${
                  curPage >= totalPages ? "text-gray-500" : "hover:bg-gray-800/60 text-gray-200"
                }`}
              >
                Próxima
              </button>
            </div>
          </>
        )}
      </details>

      {/* ===== MODAL POR CATEGORIA ===== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative z-10 mx-4 w-full max-w-7xl rounded-2xl bg-gray-900 text-white shadow-2xl border border-[#9D00FF]/30 max-h-[85vh] flex flex-col">
            {/* header */}
            <div className="flex items-start justify-between p-4 border-b border-gray-700 sticky top-0 bg-gray-900 z-10">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold truncate">
                  Atendimentos — <span className="text-[#B84CFF]">{modalCategory}</span>
                </h3>

                {modalSummary && (
                  <div className="mt-1 text-xs text-gray-300 flex flex-wrap gap-3">
                    <span>Total: <b className="text-white">{humanNumber(modalSummary.total)}</b></span>
                    <span>FCR True: <b className="text-white">{humanNumber(modalSummary.fcrTrue)}</b></span>
                    <span>FCR False: <b className="text-white">{humanNumber(modalSummary.fcrFalse)}</b></span>
                    <span>%FCR: <b className="text-white">{modalSummary.fcrRateText}</b></span>
                    <span>CSAT Médio: <b className="text-white">{modalSummary.csatAvgText}</b></span>
                    <span>| CSAT 5: <b className="text-white">{modalSummary.csCounts[5]} ({modalSummary.pctAll[5]})</b></span>
                    <span>4: <b className="text-white">{modalSummary.csCounts[4]} ({modalSummary.pctAll[4]})</b></span>
                    <span>3: <b className="text-white">{modalSummary.csCounts[3]} ({modalSummary.pctAll[3]})</b></span>
                    <span>2: <b className="text-white">{modalSummary.csCounts[2]} ({modalSummary.pctAll[2]})</b></span>
                    <span>1: <b className="text-white">{modalSummary.csCounts[1]} ({modalSummary.pctAll[1]})</b></span>
                    <span>Sem nota: <b className="text-white">{modalSummary.csCounts.miss} ({modalSummary.pctAll.miss})</b></span>
                  </div>
                )}

                {(modalFilter.csatNote != null || modalFilter.fcr) && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {modalFilter.csatNote != null && (
                      <span className="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 bg-indigo-900/30 border-indigo-500/30">
                        Filtro: CSAT = <b className="text-white">{modalFilter.csatNote}</b>
                        <button
                          className="ml-1 text-indigo-300 hover:underline"
                          onClick={() => { setModalFilter((f) => ({ ...f, csatNote: null })); setModalPage(1); }}
                        >
                          remover
                        </button>
                      </span>
                    )}
                    {modalFilter.fcr && (
                      <span className="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 bg-emerald-900/30 border-emerald-500/30">
                        Filtro: FCR = <b className="text-white">{modalFilter.fcr}</b>
                        <button
                          className="ml-1 text-emerald-300 hover:underline"
                          onClick={() => { setModalFilter((f) => ({ ...f, fcr: null })); setModalPage(1); }}
                        >
                          remover
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const clone = modalRowsAll.map(({ _cat, ...rest }) => ({ categoria: _cat, ...rest }));
                    exportCSV(clone, `atendimentos_${modalCategory}.csv`);
                  }}
                  className={btn}
                >
                  Exportar CSV
                </button>
                <button onClick={closeModal} className={btn}>
                  Fechar (Esc)
                </button>
              </div>
            </div>

            {/* conteúdo rolável */}
            <div className="p-4 overflow-auto">
              {/* paginação topo */}
              <div className="flex items-center justify-between text-sm mb-3 text-gray-200">
                <div>
                  Página <b>{modalCurPage}</b> de <b>{modalTotalPages}</b> • Registros: <b>{humanNumber(modalTotal)}</b>
                </div>
                <div className="flex items-center gap-2">
                  <label className="hidden md:inline text-gray-300">Itens por página:</label>
                  <select
                    value={modalPageSize}
                    onChange={(e) => { setModalPageSize(+e.target.value || 25); setModalPage(1); }}
                    className={selectBase}
                  >
                    {[10, 25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button
                    onClick={() => setModalPage((p) => Math.max(1, p - 1))}
                    disabled={modalCurPage <= 1}
                    className={`rounded-md px-3 py-1.5 border border-gray-700 ${
                      modalCurPage <= 1 ? "text-gray-500" : "hover:bg-gray-800/60 text-gray-200"
                    }`}
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setModalPage((p) => Math.min(modalTotalPages, p + 1))}
                    disabled={modalCurPage >= modalTotalPages}
                    className={`rounded-md px-3 py-1.5 border border-gray-700 ${
                      modalCurPage >= modalTotalPages ? "text-gray-500" : "hover:bg-gray-800/60 text-gray-200"
                    }`}
                  >
                    Próxima
                  </button>
                </div>
              </div>

              <div className={`${tableWrap}`}>
                <table className="min-w-[1200px] w-full text-sm">
                  <thead className={`${thHead} sticky top-0`}>
                    <tr>
                      {["_cat","subject","cliente","atendente","squad","session_id","csat_answer","fcr_answer","first_reply_time","waiting_time","resolution_time","total_interactions"].map((c)=>(
                        <th key={c} className="px-3 py-2 text-left capitalize">
                          {c === "_cat" ? "Categoria" : c.replaceAll("_"," ")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modalRows.map((r, i) => (
                      <tr key={i} className="odd:bg-gray-800/30 even:bg-gray-900/20">
                        <td className="px-3 py-2 border-t border-gray-700">{r._cat}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.subject ?? "")}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.cliente ?? "")}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.atendente ?? "")}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.squad ?? "")}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.session_id ?? "")}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.csat_answer ?? "")}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.fcr_answer ?? "")}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.first_reply_time ?? "")}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.waiting_time ?? "")}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.resolution_time ?? "")}</td>
                        <td className="px-3 py-2 border-t border-gray-700">{String(r?.total_interactions ?? "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* paginação bottom */}
              <div className="flex items-center justify-between text-sm mt-3 text-gray-200">
                <button
                  onClick={() => setModalPage((p) => Math.max(1, p - 1))}
                  disabled={modalCurPage <= 1}
                  className={`rounded-md px-3 py-1.5 border border-gray-700 ${
                    modalCurPage <= 1 ? "text-gray-500" : "hover:bg-gray-800/60 text-gray-200"
                  }`}
                >
                  Anterior
                </button>
                <div className="text-gray-300">Página <b>{modalCurPage}</b> de <b>{modalTotalPages}</b></div>
                <button
                  onClick={() => setModalPage((p) => Math.min(modalTotalPages, p + 1))}
                  disabled={modalCurPage >= modalTotalPages}
                  className={`rounded-md px-3 py-1.5 border border-gray-700 ${
                    modalCurPage >= modalTotalPages ? "text-gray-500" : "hover:bg-gray-800/60 text-gray-200"
                  }`}
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
