import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";

/* ======= Utilidades ======= */
function isValidBrazilianNumber(number) {
  const cleaned = String(number || "").replace(/\D/g, "");
  return /^(55\d{2}9\d{8}|\d{2}9\d{8})$/.test(cleaned);
}
function formatBrazilianNumber(number) {
  let cleaned = String(number || "").replace(/\D/g, "");
  if (cleaned.startsWith("55")) cleaned = cleaned.slice(2);
  if (cleaned.length === 10) cleaned = cleaned.slice(0, 2) + "9" + cleaned.slice(2);
  if (cleaned.length !== 11) return null;
  const area = cleaned.slice(0, 2);
  const prefix = cleaned.slice(2, 7);
  const suffix = cleaned.slice(7);
  return `(${area})${prefix}-${suffix}`;
}
function heuristicDelimiterDetect(sampleText = "") {
  const candidates = [",", ";", "\t", "|"];
  const counts = candidates.map((d) => ({
    d,
    n: (sampleText.match(new RegExp(`\\${d}`, "g")) || []).length,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0]?.d || ",";
}
function buildOutputCSV(rows) {
  const headers = [
    "Nome",
    "Telefone",
    "Email",
    "Sexo",
    "Data de nascimento",
    "Data de cadastro",
    "Pontos do fidelidade",
    "Rua",
    "Número",
    "Complemento",
    "Bairro",
    "CEP",
    "Cidade",
    "Estado",
  ];
  const padded = rows.map((r) => {
    const base = [r.nome || "Cliente", r.telefone || ""];
    while (base.length < headers.length) base.push("");
    return base;
  });
  return Papa.unparse({ fields: headers, data: padded }, { delimiter: ";" });
}
function splitArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function PlanilhaOficial() {
  const [rawPreview, setRawPreview] = useState([]);
  const [report, setReport] = useState({
    totalLidas: 0,
    totalValidas: 0,
    deletadas: {
      invalid_telefone: 0,
      invalid_whatsapp: 0,
      no_valid_number: 0,
      invalid_format: 0,
    },
    linhasDeletadas: [],
  });

  const [outputCSV, setOutputCSV] = useState("");
  const [outputParts, setOutputParts] = useState([]); // [{name, blob}]
  const [fileName, setFileName] = useState("clientes_processados.csv");
  const inputRef = useRef(null);

  const [deletedParts, setDeletedParts] = useState([]); // [{name, blob}]

  const hasResult = useMemo(
    () => Boolean(outputCSV?.length || outputParts.length),
    [outputCSV, outputParts]
  );

  const sectionCard =
    "rounded-3xl p-8 border backdrop-blur-xl bg-white/80 dark:bg-black/40 " +
    "border-purple-300/50 dark:border-purple-500/30 shadow-[0_8px_32px_rgba(139,92,246,0.2)] " +
    "hover:shadow-[0_12px_48px_rgba(139,92,246,0.3)] transition-all duration-300";

  function resetAll() {
    setRawPreview([]);
    setReport({
      totalLidas: 0,
      totalValidas: 0,
      deletadas: {
        invalid_telefone: 0,
        invalid_whatsapp: 0,
        no_valid_number: 0,
        invalid_format: 0,
      },
      linhasDeletadas: [],
    });
    setOutputCSV("");
    setOutputParts([]);
    setDeletedParts([]);
    setFileName("clientes_processados.csv");
    if (inputRef.current) inputRef.current.value = "";
  }

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

  function handleDownload() {
    if (outputParts.length > 0) {
      outputParts.forEach((p) => triggerDownloadBlob(p.blob, p.name));
    } else if (outputCSV) {
      triggerDownloadBlob(
        new Blob([outputCSV], { type: "text/csv;charset=utf-8" }),
        fileName || "clientes_processados.csv"
      );
    }
  }

  function handleDownloadDeleted() {
    if (!deletedParts.length) return;
    deletedParts.forEach((p) => triggerDownloadBlob(p.blob, p.name));
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const firstChunk = await file.slice(0, 4096).text();
    const fallbackDelimiter = heuristicDelimiterDetect(firstChunk);

    Papa.parse(file, {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (results) => {
        let rows = results.data;
        const needsRetry =
          Array.isArray(rows) &&
          rows.length > 0 &&
          rows[0] &&
          rows[0].length <= 1 &&
          fallbackDelimiter !== ",";
        if (needsRetry) {
          Papa.parse(file, {
            header: false,
            dynamicTyping: false,
            skipEmptyLines: true,
            delimiter: fallbackDelimiter,
            complete: (res2) => processData(res2.data),
          });
        } else {
          processData(rows);
        }
      },
      error: () => {
        Papa.parse(file, {
          header: false,
          dynamicTyping: false,
          skipEmptyLines: true,
          delimiter: fallbackDelimiter,
          complete: (res2) => processData(res2.data),
        });
      },
    });
  }

  function processData(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      // Modal simples
      const modal = document.createElement("div");
      modal.className =
        "fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50";
      modal.innerHTML = `
        <div class="bg-white dark:bg-slate-900 border border-purple-300/50 dark:border-purple-500/40 p-8 rounded-3xl shadow-2xl max-w-md w-full mx-4">
          <p class="text-gray-800 dark:text-white mb-6 text-lg">Não foi possível ler o arquivo CSV.</p>
          <button class="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg" onclick="this.closest('.fixed').remove()">Entendi</button>
        </div>
      `;
      document.body.appendChild(modal);
      return;
    }

    setRawPreview(rows.slice(0, 5));

    const deleted = {
      invalid_telefone: 0,
      invalid_whatsapp: 0,
      no_valid_number: 0,
      invalid_format: 0,
    };
    const linhasDeletadas = [];
    const processadas = [];
    const deletedRowsData = [];

    let startIndex = 0;
    const headerRow = rows[0]?.map((c) => String(c || "").toLowerCase().trim());
    const looksLikeHeader =
      headerRow &&
      (headerRow.includes("nome") ||
        headerRow.includes("telefone") ||
        headerRow.includes("whatsapp"));
    if (looksLikeHeader) startIndex = 1;

    let totalLidas = 0;

    for (let i = startIndex; i < rows.length; i += 1) {
      const rowNum = i + 1;
      const row = rows[i] || [];
      const nome = String(row[0] || "").trim();
      const telefone = String(row[1] || "").trim();
      const whatsapp = String(row[2] || "").trim();

      totalLidas += 1;

      let reason = null;
      let finalPhone = "";

      if (telefone) {
        if (isValidBrazilianNumber(telefone)) {
          const formatted = formatBrazilianNumber(telefone);
          if (!formatted) reason = "invalid_format";
          else finalPhone = formatted;
        } else {
          reason = "invalid_telefone";
        }
      } else if (whatsapp) {
        if (isValidBrazilianNumber(whatsapp)) {
          const formatted = formatBrazilianNumber(whatsapp);
          if (!formatted) reason = "invalid_format";
          else finalPhone = formatted;
        } else {
          reason = "invalid_whatsapp";
        }
      } else {
        reason = "no_valid_number";
      }

      if (reason) {
        deleted[reason] += 1;
        linhasDeletadas.push(rowNum);
        deletedRowsData.push({
          "Linha original": rowNum,
          Motivo: reason,
          Nome: nome,
          Telefone: telefone,
          Whatsapp: whatsapp,
        });
        continue;
      }

      processadas.push({ nome: nome || "Cliente", telefone: finalPhone });
    }

    // Saída válida
    const CHUNK = 5000;
    if (processadas.length > CHUNK) {
      const slices = splitArray(processadas, CHUNK);
      const parts = slices.map((slice, idx) => {
        const csvStr = buildOutputCSV(slice);
        return {
          name: `${(fileName || "clientes_processados")
            .replace(/\.csv$/i, "")}_parte_${idx + 1}.csv`,
          blob: new Blob([csvStr], { type: "text/csv;charset=utf-8" }),
        };
      });
      setOutputParts(parts);
      setOutputCSV("");
    } else {
      const csvOut = buildOutputCSV(processadas);
      setOutputCSV(csvOut);
      setOutputParts([]);
    }

    // Deletados
    if (deletedRowsData.length > 0) {
      const delSlices = splitArray(deletedRowsData, CHUNK);
      const delParts = delSlices.map((slice, idx) => {
        const csv = Papa.unparse(slice, { delimiter: ";" });
        const base = (fileName || "clientes_processados").replace(/\.csv$/i, "");
        const name =
          delSlices.length > 1
            ? `${base}_deletados_parte_${idx + 1}.csv`
            : `${base}_deletados.csv`;
        return { name, blob: new Blob([csv], { type: "text/csv;charset=utf-8" }) };
      });
      setDeletedParts(delParts);
    } else {
      setDeletedParts([]);
    }

    setReport({
      totalLidas,
      totalValidas: processadas.length,
      deletadas: deleted,
      linhasDeletadas,
    });
  }

  const hasDeleted = report.linhasDeletadas.length > 0;

  return (
    <section className={sectionCard}>
      <div className="flex items-center gap-6 mb-10">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-500 via-violet-600 to-purple-700 shadow-lg shadow-purple-500/30 border border-purple-400/30">
          <span className="text-3xl">📋</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white">
            Tratador de CSV — Telefones BR (Apenas nome e numero)
          </h2>
          <p className="text-gray-600 dark:text-gray-300 text-lg mt-2">
            Processa/valida números brasileiros e divide em partes de 5.000 registros.
          </p>
        </div>
      </div>

      {/* Seleção */}
      <div className="rounded-2xl p-1 bg-gradient-to-r from-purple-200/40 dark:from-purple-500/20 via-violet-200/30 dark:via-violet-500/20 to-purple-200/40 dark:to-purple-500/20 mb-10">
        <div className="p-8 rounded-xl bg-white/90 dark:bg-slate-800/80 backdrop-blur-lg">
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
              📁 Seleção de Arquivo
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              Aceita CSV com colunas:{" "}
              <span className="text-purple-600 dark:text-purple-400 font-semibold">
                Nome
              </span>
              ,{" "}
              <span className="text-purple-600 dark:text-purple-400 font-semibold">
                Telefone
              </span>{" "}
              e{" "}
              <span className="text-purple-600 dark:text-purple-400 font-semibold">
                Whatsapp
              </span>{" "}
              (nessa ordem).
            </p>
          </div>

          <div className="flex gap-4 items-end">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="flex-1 text-base file:mr-4 file:py-4 file:px-8 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-gradient-to-r file:from-purple-600 file:to-violet-600 file:text-white hover:file:from-purple-700 hover:file:to-violet-700 file:transition-all file:cursor-pointer file:shadow-lg bg-gray-50 dark:bg-slate-700/60 border border-purple-300/50 dark:border-purple-500/30 rounded-xl text-gray-800 dark:text-white"
            />
            <button
              onClick={resetAll}
              className="px-8 py-4 bg-gray-200 dark:bg-slate-600/60 hover:bg-gray-300 dark:hover:bg-slate-600/80 text-gray-700 dark:text-white rounded-xl font-medium transition-all duration-200 border border-gray-300 dark:border-slate-500/30"
            >
              🗑️ Limpar
            </button>
          </div>
        </div>
      </div>

      {/* Relatório + Export */}
      <div className="grid lg:grid-cols-2 gap-10">
        {/* Relatório */}
        <div>
          <h3 className="text-2xl font-bold mb-6 flex items-center gap-3 text-gray-800 dark:text-white">
            <span className="text-3xl">📊</span>
            <span>Relatório de Processamento</span>
          </h3>

          <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-8 backdrop-blur-lg">
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="text-center p-6 bg-gradient-to-br from-purple-100/80 dark:from-purple-600/20 to-violet-100/80 dark:to-violet-600/20 rounded-xl border border-purple-300/50 dark:border-purple-500/30">
                <div className="text-3xl font-bold text-purple-700 dark:text-purple-300 mb-2">
                  {report.totalLidas}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                  Total lidas
                </div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-emerald-100/80 dark:from-emerald-600/20 to-green-100/80 dark:to-green-600/20 rounded-xl border border-emerald-300/50 dark:border-emerald-500/30">
                <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 mb-2">
                  {report.totalValidas}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                  Válidas
                </div>
              </div>
            </div>

            {hasDeleted && (
              <div className="mb-8">
                <button
                  onClick={handleDownloadDeleted}
                  className="w-full px-6 py-4 bg-gradient-to-r from-red-100/80 dark:from-red-600/30 to-rose-100/80 dark:to-rose-600/30 hover:from-red-200/80 dark:hover:from-red-600/40 hover:to-rose-200/80 dark:hover:to-rose-600/40 text-red-700 dark:text-red-200 border border-red-300/60 dark:border-red-500/40 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <span>📥</span>
                  Baixar registros deletados (.csv)
                </button>
              </div>
            )}

            <div>
              <h4 className="font-bold text-rose-600 dark:text-rose-400 mb-4 text-lg">
                📋 Registros Deletados
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-3 px-4 bg-gray-100/80 dark:bg-slate-700/40 rounded-lg border border-gray-300/50 dark:border-slate-600/30">
                  <span className="text-gray-700 dark:text-gray-200 font-medium flex items-center gap-2">
                    <span>📞</span> Telefone inválido
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-500/20 px-3 py-1 rounded-full">
                    {report.deletadas.invalid_telefone}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 bg-gray-100/80 dark:bg-slate-700/40 rounded-lg border border-gray-300/50 dark:border-slate-600/30">
                  <span className="text-gray-700 dark:text-gray-200 font-medium flex items-center gap-2">
                    <span>💬</span> Whatsapp inválido
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-500/20 px-3 py-1 rounded-full">
                    {report.deletadas.invalid_whatsapp}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 bg-gray-100/80 dark:bg-slate-700/40 rounded-lg border border-gray-300/50 dark:border-slate-600/30">
                  <span className="text-gray-700 dark:text-gray-200 font-medium flex items-center gap-2">
                    <span>❌</span> Sem número válido
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-500/20 px-3 py-1 rounded-full">
                    {report.deletadas.no_valid_number}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 bg-gray-100/80 dark:bg-slate-700/40 rounded-lg border border-gray-300/50 dark:border-slate-600/30">
                  <span className="text-gray-700 dark:text-gray-200 font-medium flex items-center gap-2">
                    <span>⚠️</span> Formato inválido
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-500/20 px-3 py-1 rounded-full">
                    {report.deletadas.invalid_format}
                  </span>
                </div>
              </div>

              {hasDeleted && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                    Mostrar linhas removidas
                  </summary>
                  <div className="mt-3 p-3 bg-gray-100/70 dark:bg-slate-700/40 rounded-lg text-sm text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                    {report.linhasDeletadas.join(", ")}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>

        {/* Exportar */}
        <div>
          <h3 className="text-2xl font-bold mb-6 flex items-center gap-3 text-gray-800 dark:text-white">
            <span className="text-3xl">💾</span>
            <span>Exportar Resultados</span>
          </h3>

          <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-8 backdrop-blur-lg space-y-6">
            <div>
              <label className="block text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">
                📝 Nome do arquivo
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-gray-50 dark:bg-slate-700/60 px-6 py-4 text-gray-800 dark:text-white text-lg font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 backdrop-blur-lg"
              />
            </div>

            <button
              onClick={handleDownload}
              disabled={!hasResult}
              className={`w-full rounded-xl px-8 py-6 font-bold text-lg transition-all duration-300 ${
                hasResult
                  ? "bg-gradient-to-r from-purple-600 via-violet-600 to-purple-600 text-white hover:from-purple-500 hover:via-violet-500 hover:to-purple-500 shadow-[0_8px_32px_rgba(139,92,246,0.4)] hover:shadow-[0_12px_48px_rgba(139,92,246,0.6)] transform hover:scale-[1.02]"
                  : "bg-gray-300/60 dark:bg-slate-600/40 text-gray-500 dark:text-slate-400 cursor-not-allowed"
              }`}
            >
              {outputParts.length > 0 ? "📦 Baixar todas as partes" : "📄 Baixar CSV processado"}
            </button>

            {outputParts.length > 0 && (
              <div className="space-y-4">
                <div className="text-sm text-blue-700 dark:text-blue-300 p-4 bg-gradient-to-r from-blue-100/80 dark:from-blue-900/30 to-purple-100/80 dark:to-purple-900/30 border border-blue-300/60 dark:border-blue-600/30 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">📦</span>
                    <strong className="text-blue-800 dark:text-blue-200">Arquivo dividido automaticamente</strong>
                  </div>
                  <p>
                    Geradas <span className="font-bold">{outputParts.length}</span> partes (máx.
                    5.000 registros por parte)
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {outputParts.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => triggerDownloadBlob(p.blob, p.name)}
                      className="px-3 py-2 bg-gradient-to-r from-gray-200/80 dark:from-slate-700/60 to-purple-200/80 dark:to-slate-600/60 hover:from-gray-300/80 dark:hover:from-slate-600/80 hover:to-purple-300/80 dark:hover:to-slate-500/80 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-all duration-200 border border-gray-300/50 dark:border-slate-500/30"
                    >
                      Parte {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-sm text-gray-600 dark:text-gray-300 p-6 bg-gradient-to-r from-gray-100/80 dark:from-slate-700/40 to-purple-100/80 dark:to-purple-800/40 rounded-xl border border-purple-300/40 dark:border-purple-500/20">
              <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <span>ℹ️</span> Informações do formato de saída
              </h4>
              <p>
                <strong>Delimitador:</strong>{" "}
                <span className="text-purple-600 dark:text-purple-400 font-mono bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded">
                  ;
                </span>
              </p>
              <p className="text-xs leading-relaxed mt-2">
                Cabeçalhos: Nome, Telefone, Email, Sexo, Data de nascimento, Data de cadastro,
                Pontos do fidelidade, Rua, Número, Complemento, Bairro, CEP, Cidade, Estado
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
