import React, { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import JSZip from "jszip"; // ainda usado se você quiser futuramente zip, mas podemos remover se quiser

// tamanho fixo de divisão
const DEFAULT_CHUNK_SIZE = 5000;

/**
 * Conversor .XLSX → .CSV
 * - Lê o Excel, escolhe a aba
 * - Divide em partes automáticas (~5000 linhas cada)
 * - Gera CSV único gigante (tudo junto)
 * - Gera CSV separado por parte
 * - Mostra estatísticas
 * - NÃO mostra preview e NÃO pede chunk manual
 */
export default function Conversor() {
  const fileInputRef = useRef(null);

  // estado principal
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState([]);             // nomes das abas
  const [selectedSheet, setSelectedSheet] = useState(""); // aba atual

  const [parts, setParts] = useState([]); // [{name, blob, rowCount}]
  const [info, setInfo] = useState("");

  // dados para montar o CSV único
  const [combinedHeader, setCombinedHeader] = useState([]);
  const [combinedSlices, setCombinedSlices] = useState([]); // [ [linhasParte1], [linhasParte2], ...]

  // estilo base do card
  const card =
    "rounded-3xl p-8 border backdrop-blur-xl bg-white/80 dark:bg-black/40 " +
    "border-purple-300/50 dark:border-purple-500/30 shadow-[0_8px_32px_rgba(139,92,246,0.2)] " +
    "hover:shadow-[0_12px_48px_rgba(139,92,246,0.3)] transition-all duration-300";

  // util: baixa um Blob com nome custom
  function triggerDownloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // divide array grande em fatias de n itens
  function splitArray(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) {
      out.push(arr.slice(i, i + n));
    }
    return out;
  }

  // tira caracteres ruins do nome
  function sanitizeSheetName(name) {
    return (
      String(name || "")
        .replace(/[:\\/?*\[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Planilha"
    );
  }

  // quando escolhe arquivo Excel
  async function handleXlsx(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // limpa tudo anterior
    setFileName(file.name);
    setSheets([]);
    setSelectedSheet("");
    setParts([]);
    setInfo("");
    setCombinedHeader([]);
    setCombinedSlices([]);

    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { dense: true });

      const names = wb.SheetNames || [];
      setSheets(names);

      if (names[0]) {
        setSelectedSheet(names[0]);
        setInfo(`📊 Arquivo carregado com ${names.length} aba(s).`);
      }
    } catch (err) {
      console.error("Erro lendo XLSX:", err);
      setInfo("❌ Falha ao ler o arquivo. Verifique se é um XLSX válido.");
    }
  }

  // troca de aba
  function onChangeSheet(name) {
    setSelectedSheet(name);

    // reset dos dados gerados (porque mudou de aba)
    setParts([]);
    setInfo("");
    setCombinedHeader([]);
    setCombinedSlices([]);
  }

  // converter aba atual
  async function convertSelectedSheet() {
    try {
      if (!selectedSheet) return;
      const file = fileInputRef.current?.files?.[0];
      if (!file) {
        setInfo("⚠️ Selecione um arquivo Excel primeiro.");
        return;
      }

      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { dense: true });
      const ws = wb.Sheets[selectedSheet];

      if (!ws) {
        setInfo("❌ Aba não encontrada.");
        return;
      }

      // rows = [[colA,colB,...],[v1,v2,...],...]
      const rows =
        XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) || [];

      if (rows.length === 0) {
        setInfo("⚠️ Aba vazia.");
        return;
      }

      const [header, ...dataRows] = rows;

      // quebra automática em blocos fixos
      const slices = splitArray(dataRows, DEFAULT_CHUNK_SIZE);

      const base = (fileName || "planilha").replace(
        /\.(xlsx|xlsm|xls|xlsb)$/i,
        ""
      );
      const safeSheet = sanitizeSheetName(selectedSheet);

      // gerar csv pra cada parte
      const generated = (slices.length ? slices : [dataRows]).map(
        (slice, idx) => {
          const csv = Papa.unparse([header, ...slice], {
            delimiter: ",",
          });

          const name =
            slices.length > 1
              ? `${base}_${safeSheet}_parte_${idx + 1}.csv`
              : `${base}_${safeSheet}.csv`;

          return {
            name,
            blob: new Blob([csv], {
              type: "text/csv;charset=utf-8",
            }),
            rowCount: slice.length,
          };
        }
      );

      setParts(generated);

      setInfo(
        `✅ Conversão concluída • ${dataRows.length.toLocaleString(
          "pt-BR"
        )} linhas de dados${
          slices.length > 1
            ? ` • divididas em ${slices.length} partes (~${DEFAULT_CHUNK_SIZE} linhas cada)`
            : ""
        } • ${header.length} colunas`
      );

      // salva dados crus pra montar CSV único depois
      setCombinedHeader(header);
      setCombinedSlices(slices.length ? slices : [dataRows]);
    } catch (err) {
      console.error("Erro na conversão:", err);
      setInfo("❌ Erro inesperado ao converter. Veja o console.");
    }
  }

  // CSV único gigante (todas as partes juntas)
  function downloadCombinedCSV() {
    if (!combinedSlices.length) return;

    // junta tudo
    const allRows = [];
    for (const slice of combinedSlices) {
      allRows.push(...slice);
    }

    // monta CSV com cabeçalho só uma vez
    const csv = Papa.unparse([combinedHeader, ...allRows], {
      delimiter: ",",
    });

    const base = (fileName || "planilha").replace(
      /\.(xlsx|xlsm|xls|xlsb)$/i,
      ""
    );
    const safeSheet = sanitizeSheetName(selectedSheet);

    const finalName =
      combinedSlices.length > 1
        ? `${base}_${safeSheet}_todas_partes.csv`
        : `${base}_${safeSheet}.csv`;

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });

    triggerDownloadBlob(blob, finalName);
  }

  // (removemos o botão "baixar tudo em zip", então essa função não é mais usada.
  // se quiser, podemos deletar totalmente. Vou deixar comentada.)
  /*
  async function downloadAllCSVsAsZip() {
    if (!parts.length) return;

    const zip = new JSZip();
    const base = (fileName || "planilha").replace(
      /\.(xlsx|xlsm|xls|xlsb)$/i,
      ""
    );
    const folder = zip.folder(base);

    for (const p of parts) {
      const content = await p.blob.arrayBuffer();
      folder.file(p.name, content);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    triggerDownloadBlob(blob, `${base}_todas_partes.zip`);
  }
  */

  // estatísticas
  const stats = useMemo(() => {
    if (!parts.length) return null;
    const totalRows = parts.reduce((sum, p) => sum + p.rowCount, 0);
    const totalSize = parts.reduce((sum, p) => sum + p.blob.size, 0);
    return {
      totalRows,
      totalSize,
      avgRowsPerPart: Math.round(totalRows / parts.length),
      columns: combinedHeader.length,
    };
  }, [parts, combinedHeader]);

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  }

  return (
    <div className="max-w-7xl mx-auto">
      <section className={card}>
        {/* Cabeçalho da página */}
        <div className="flex items-center gap-6 mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-500 via-violet-600 to-purple-700 shadow-lg shadow-purple-500/30 border border-purple-400/30">
            <span className="text-3xl">🔄</span>
          </div>
          <div>
            <h3 className="text-3xl font-bold text-gray-800 dark:text-white">
              Conversor Excel → CSV
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-lg mt-2">
              Converte sua planilha em CSV, divide automático em partes e
              permite baixar tudo junto em um único arquivo.
            </p>
          </div>
        </div>

        {/* Upload + escolha de aba */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Upload Excel */}
          <div className="md:col-span-2">
            <label className="block text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">
              📁 Arquivo Excel
            </label>
            <input
              ref={fileInputRef}
              id="xlsx-input"
              type="file"
              accept=".xlsx,.xlsm,.xlsb,.xls"
              onChange={handleXlsx}
              className="w-full rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-gray-50 dark:bg-slate-700/60 px-6 py-4 text-gray-800 dark:text-white text-base font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 backdrop-blur-lg file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gradient-to-r file:from-purple-600 file:to-violet-600 file:text-white hover:file:from-purple-700 hover:file:to-violet-700 file:transition-all file:cursor-pointer file:shadow-lg"
            />
            {fileName && (
              <div className="mt-3 text-sm text-purple-700 dark:text-purple-300 truncate bg-purple-100/60 dark:bg-purple-900/20 px-3 py-2 rounded-lg">
                📄 {fileName}
              </div>
            )}
          </div>

          {/* Dropdown com abas */}
          <div>
            <label className="block text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">
              📋 Aba (Planilha)
            </label>
            <select
              value={selectedSheet}
              onChange={(e) => onChangeSheet(e.target.value)}
              disabled={sheets.length === 0}
              className="w-full rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-gray-50 dark:bg-slate-700/60 px-6 py-4 text-gray-800 dark:text-white text-base font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 backdrop-blur-lg disabled:opacity-50"
            >
              {sheets.map((n) => (
                <option
                  key={n}
                  value={n}
                  className="bg-gray-50 dark:bg-slate-800"
                >
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Configurações (agora só informativa) */}
        <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-gradient-to-br from-purple-50/80 dark:from-purple-900/20 to-violet-50/80 dark:to-violet-900/20 p-6 backdrop-blur-lg mb-8">
          <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span>⚙️</span> Configurações automáticas
          </h4>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-700 rounded-xl px-4 py-3 border border-purple-300/50 dark:border-purple-500/30 w-full">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Divisão do arquivo
              </div>
              <div className="text-lg font-bold text-gray-800 dark:text-white">
                ~{DEFAULT_CHUNK_SIZE.toLocaleString("pt-BR")} linhas por parte
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                (automático, sem precisar configurar)
              </div>
            </div>

            <div className="bg-white dark:bg-slate-700 rounded-xl px-4 py-3 border border-purple-300/50 dark:border-purple-500/30 w-full">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Formato de saída
              </div>
              <div className="text-lg font-bold text-gray-800 dark:text-white">
                CSV (vírgula)
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Compatível com importação em sistemas
              </div>
            </div>
          </div>
        </div>

        {/* Botão converter + resumo de quantas partes saíram */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <button
            onClick={convertSelectedSheet}
            disabled={!selectedSheet}
            className="rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white px-8 py-4 text-lg font-bold shadow-[0_8px_32px_rgba(139,92,246,0.35)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02]"
          >
            🚀 Converter aba selecionada
          </button>

          {parts.length > 0 && (
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 bg-purple-100/80 dark:bg-purple-900/30 px-4 py-3 rounded-xl border border-purple-300/50 dark:border-purple-500/30">
              <span className="text-lg">📦</span>
              <span className="font-medium">
                {parts.length} parte
                {parts.length > 1 ? "s" : ""} gerada
                {parts.length > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Mensagem de status */}
        {info && (
          <div className="mb-8 p-4 bg-gradient-to-r from-gray-100/80 dark:from-slate-700/60 to-purple-100/80 dark:to-purple-800/60 rounded-xl border border-purple-300/50 dark:border-purple-500/30 text-gray-700 dark:text-gray-200 font-medium">
            {info}
          </div>
        )}

        {/* Estatísticas */}
        {parts.length > 0 && stats && (
          <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-gradient-to-br from-blue-50/80 dark:from-blue-900/20 to-indigo-50/80 dark:to-indigo-900/20 p-6 backdrop-blur-lg mb-8">
            <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <span>📊</span> Estatísticas
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 border border-blue-300/50 dark:border-blue-500/30">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total de linhas
                </div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.totalRows.toLocaleString("pt-BR")}
                </div>
              </div>

              <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 border border-blue-300/50 dark:border-blue-500/30">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Colunas
                </div>
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {stats.columns}
                </div>
              </div>

              <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 border border-blue-300/50 dark:border-blue-500/30">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Tamanho total (todas as partes)
                </div>
                <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                  {formatBytes(stats.totalSize)}
                </div>
              </div>

              <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 border border-blue-300/50 dark:border-blue-500/30">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Média por parte
                </div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {stats.avgRowsPerPart.toLocaleString("pt-BR")}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Downloads */}
        {parts.length > 0 && (
          <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg space-y-6">
            <h4 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <span>💾</span> Opções de Download
            </h4>

            {/* Botão azul: CSV único grandão */}
            <div className="grid md:grid-cols-1 gap-4">
              <button
                onClick={downloadCombinedCSV}
                className="rounded-xl px-6 py-4 font-bold text-base transition-all duration-300 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-[0_8px_24px_rgba(37,99,235,0.35)] hover:shadow-[0_12px_36px_rgba(37,99,235,0.45)] transform hover:scale-[1.02] flex items-center justify-center gap-2"
                title="Gera um único CSV juntando TODAS as partes"
              >
                <span>📘</span>
                <span>Baixar TUDO em um único CSV (.csv)</span>
              </button>
            </div>

            {/* Downloads individuais */}
            <div>
              <h5 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                <span>📄</span> Download individual (CSV)
              </h5>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {parts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => triggerDownloadBlob(p.blob, p.name)}
                    title={p.name}
                    className="px-4 py-4 rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-gradient-to-br from-gray-50/80 dark:from-slate-700/60 to-purple-50/80 dark:to-purple-800/40 hover:from-gray-100/80 dark:hover:from-slate-600/80 hover:to-purple-100/80 dark:hover:to-purple-700/60 font-medium transition-all duration-200 hover:scale-[1.02] shadow-lg text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-800 dark:text-white truncate">
                          📄 Parte {idx + 1}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {p.rowCount.toLocaleString("pt-BR")} linhas •{" "}
                          {formatBytes(p.blob.size)}
                        </div>
                      </div>
                      <div className="text-2xl opacity-50">⬇️</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
