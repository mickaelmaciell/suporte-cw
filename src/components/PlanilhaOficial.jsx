// src/components/PlanilhaOficial.jsx
import { useState, useMemo, useRef } from "react";
import Papa from "papaparse";

/* ===================== Utilidades CSV ===================== */

// Valida número brasileiro: 55DD9XXXXXXXX ou DD9XXXXXXXX
function isValidBrazilianNumber(number) {
  const cleaned = String(number || "").replace(/\D/g, "");
  return /^(55\d{2}9\d{8}|\d{2}9\d{8})$/.test(cleaned);
}

// Formata para (DD)9XXXX-XXXX e injeta o 9 se vier só com 8 dígitos locais
function formatBrazilianNumber(number) {
  let cleaned = String(number || "").replace(/\D/g, "");
  if (cleaned.startsWith("55")) cleaned = cleaned.slice(2); // remove 55
  if (cleaned.length === 10) cleaned = cleaned.slice(0, 2) + "9" + cleaned.slice(2); // injeta 9
  if (cleaned.length !== 11) return null;

  const area = cleaned.slice(0, 2);
  const prefix = cleaned.slice(2, 7);
  const suffix = cleaned.slice(7);
  return `(${area})${prefix}-${suffix}`;
}

// Heurística leve para detectar delimitador quando o Papa não acertar
function heuristicDelimiterDetect(sampleText = "") {
  const candidates = [",", ";", "\t", "|"];
  const counts = candidates.map((d) => ({
    d,
    n: (sampleText.match(new RegExp(`\\${d}`, "g")) || []).length,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0]?.d || ",";
}

// Constrói CSV de saída com delimitador ';' e 14 cabeçalhos
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

// Divide um array em partes do tamanho chunkSize
function splitArray(arr, chunkSize) {
  const parts = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    parts.push(arr.slice(i, i + chunkSize));
  }
  return parts;
}

/* ===================== Componente ===================== */

export default function PlanilhaOficial() {
  // Estado do Tratador de CSV
  const [rawPreview, setRawPreview] = useState([]); // prévia da planilha original (se quiser usar)
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

  // Resultado único (quando <=5k) e também em partes (quando >5k)
  const [outputCSV, setOutputCSV] = useState(""); // CSV final "inteiro"
  const [outputParts, setOutputParts] = useState([]); // [{name, blob}]
  const [fileName, setFileName] = useState("clientes_processados.csv");
  const inputRef = useRef(null);

  // CSV(s) dos DELETADOS (partes se > 5k)
  const [deletedParts, setDeletedParts] = useState([]); // [{name, blob}]

  const hasResult = useMemo(
    () => Boolean(outputCSV?.length || outputParts.length),
    [outputCSV, outputParts]
  );

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

  // baixar CSV com os registros deletados (partes, se houver)
  function handleDownloadDeleted() {
    if (!deletedParts.length) return;
    deletedParts.forEach((p) => triggerDownloadBlob(p.blob, p.name));
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // lê pequeno trecho para heurística
    const firstChunk = await file.slice(0, 4096).text();
    const fallbackDelimiter = heuristicDelimiterDetect(firstChunk);

    Papa.parse(file, {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (results) => {
        let rows = results.data;

        // se o parser devolveu tudo colado (muito poucas colunas), tenta forçar o delimitador heurístico
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
            complete: (res2) => {
              processData(res2.data);
            },
          });
        } else {
          processData(rows);
        }
      },
      error: () => {
        // fallback final usando heurística
        Papa.parse(file, {
          header: false,
          dynamicTyping: false,
          skipEmptyLines: true,
          delimiter: fallbackDelimiter,
          complete: (res2) => {
            processData(res2.data);
          },
        });
      },
    });
  }

  function processData(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      // modal simples no lugar de alert
      const modal = document.createElement("div");
      modal.className =
        "fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50";
      modal.innerHTML = `
        <div class="bg-gray-900 border border-[#9D00FF]/40 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4">
          <p class="text-white mb-4">Não foi possível ler o arquivo CSV.</p>
          <button class="w-full px-4 py-2 bg-[#9D00FF] hover:bg-[#7A00CC] text-white rounded-lg font-medium" onclick="this.closest('.fixed').remove()">OK</button>
        </div>
      `;
      document.body.appendChild(modal);
      return;
    }

    // guarda preview das primeiras 5 linhas (se quiser exibir futuramente)
    setRawPreview(rows.slice(0, 5));

    const deleted = {
      invalid_telefone: 0,
      invalid_whatsapp: 0,
      no_valid_number: 0,
      invalid_format: 0,
    };
    const linhasDeletadas = [];
    const processadas = [];
    const deletedRowsData = []; // para export dos deletados

    // Se houver cabeçalho explícito, use-o; senão, considere que as 3 primeiras colunas são nome/telefone/whatsapp
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
      const rowNum = i + 1; // 1-based visual
      const row = rows[i] || [];

      // garantir pelo menos 3 colunas: nome, telefone, whatsapp
      const nome = String(row[0] || "").trim();
      const telefone = String(row[1] || "").trim();
      const whatsapp = String(row[2] || "").trim();

      totalLidas += 1;

      let reason = null;
      let finalPhone = "";

      if (telefone) {
        if (isValidBrazilianNumber(telefone)) {
          const formatted = formatBrazilianNumber(telefone);
          if (!formatted) {
            reason = "invalid_format";
          } else {
            finalPhone = formatted;
          }
        } else {
          reason = "invalid_telefone";
        }
      } else if (whatsapp) {
        if (isValidBrazilianNumber(whatsapp)) {
          const formatted = formatBrazilianNumber(whatsapp);
          if (!formatted) {
            reason = "invalid_format";
          } else {
            finalPhone = formatted;
          }
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
          "Motivo": reason,
          "Nome": nome,
          "Telefone": telefone,
          "Whatsapp": whatsapp,
        });
        continue; // pula linha inválida
      }

      processadas.push({ nome: nome || "Cliente", telefone: finalPhone });
    }

    // Gera CSV(s) válidos com split em 5k
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

    // CSV(s) dos deletados
    if (deletedRowsData.length > 0) {
      const delSlices = splitArray(deletedRowsData, CHUNK);
      const delParts = delSlices.map((slice, idx) => {
        const csv = Papa.unparse(slice, { delimiter: ";" });
        const base = (fileName || "clientes_processados").replace(/\.csv$/i, "");
        const name =
          delSlices.length > 1
            ? `${base}_deletados_parte_${idx + 1}.csv`
            : `${base}_deletados.csv`;
        return {
          name,
          blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
        };
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

  /* ===================== UI ===================== */

  // helpers visuais para “cartões” vidro/roxo usando utilitários Tailwind:
  const sectionCard =
    "rounded-2xl p-8 border backdrop-blur-lg " +
    "bg-black/40 border-[#9D00FF]/30 shadow-[0_0_20px_rgba(157,0,255,0.25)]";

  const titleBadge =
    "w-14 h-14 rounded-xl flex items-center justify-center " +
    "bg-gradient-to-r from-[#9D00FF] to-[#B84CFF]";

  const hasDeleted = report.linhasDeletadas.length > 0;

  return (
    <section className={sectionCard}>
      <div className="flex items-center gap-4 mb-8">
        <div className={titleBadge}>
          <span className="text-2xl">📋</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold">
            Tratador de CSV — Telefones BR (APENAS NOME E NÚMERO)
          </h2>
          <p className="text-gray-300 text-sm mt-1">
            Processa e valida números brasileiros. Divide em partes (5.000) automaticamente.
          </p>
        </div>
      </div>

      {/* Box com “borda degradê” simulada */}
      <div className="rounded-xl p-[2px] bg-gradient-to-r from-[#9D00FF] via-[#B84CFF] to-[#9D00FF] mb-8">
        <div className="p-6 rounded-[10px] bg-black">
          <p className="text-gray-300 mb-6 leading-relaxed">
            Aceita CSV com colunas:{" "}
            <span className="text-[#B84CFF] font-semibold">Nome</span>,{" "}
            <span className="text-[#B84CFF] font-semibold">Telefone</span> e{" "}
            <span className="text-[#B84CFF] font-semibold">Whatsapp</span> (nessa ordem).
            Se não houver cabeçalho, a primeira linha será tratada como dado.
          </p>
          <div className="flex gap-4 items-center">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="flex-1 text-base file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-[#9D00FF] file:text-white hover:file:bg-[#7A00CC] file:transition-all file:cursor-pointer bg-gray-800 border border-gray-600 rounded-xl text-white"
            />
            <button
              onClick={resetAll}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-all"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {/* Relatório + Exportar */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Relatório */}
        <div>
          <h3 className="text-xl font-semibold mb-4">📊 Relatório</h3>
          <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="text-center p-4 bg-gray-700/40 rounded-lg">
                <div className="text-2xl font-bold text-[#9D00FF]">
                  {report.totalLidas}
                </div>
                <div className="text-sm text-gray-300">Total lidas</div>
              </div>
              <div className="text-center p-4 bg-gray-700/40 rounded-lg">
                <div className="text-2xl font-bold text-emerald-400">
                  {report.totalValidas}
                </div>
                <div className="text-sm text-gray-300">Válidas</div>
              </div>
            </div>

            {hasDeleted && (
              <div className="mb-6">
                <button
                  onClick={handleDownloadDeleted}
                  className="w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-600/40 rounded-lg font-medium transition-all text-sm"
                  title="Exportar linhas removidas para CSV separado"
                >
                  📥 Baixar registros deletados (.csv)
                </button>
              </div>
            )}

            <div>
              <h4 className="font-semibold text-rose-300 mb-3">Registros Deletados:</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 px-3 bg-gray-700/30 rounded">
                  <span className="text-gray-200">Telefone inválido</span>
                  <span className="font-medium text-rose-300">
                    {report.deletadas.invalid_telefone}
                  </span>
                </div>
                <div className="flex justify-between py-2 px-3 bg-gray-700/30 rounded">
                  <span className="text-gray-200">Whatsapp inválido</span>
                  <span className="font-medium text-rose-300">
                    {report.deletadas.invalid_whatsapp}
                  </span>
                </div>
                <div className="flex justify-between py-2 px-3 bg-gray-700/30 rounded">
                  <span className="text-gray-200">Sem número válido</span>
                  <span className="font-medium text-rose-300">
                    {report.deletadas.no_valid_number}
                  </span>
                </div>
                <div className="flex justify-between py-2 px-3 bg-gray-700/30 rounded">
                  <span className="text-gray-200">Formato inválido</span>
                  <span className="font-medium text-rose-300">
                    {report.deletadas.invalid_format}
                  </span>
                </div>
              </div>
            </div>

            {hasDeleted && (
              <details className="mt-4">
                <summary className="cursor-pointer text-gray-300 hover:text-white transition-colors">
                  Mostrar linhas removidas
                </summary>
                <div className="mt-3 p-3 bg-gray-700/30 rounded-lg text-sm text-gray-300 max-h-32 overflow-y-auto">
                  {report.linhasDeletadas.join(", ")}
                </div>
              </details>
            )}
          </div>
        </div>

        {/* Exportar */}
        <div>
          <h3 className="text-xl font-semibold mb-4">💾 Exportar</h3>
          <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Nome do arquivo:
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#9D00FF] focus:border-[#9D00FF]"
              />
            </div>

            <button
              onClick={handleDownload}
              disabled={!hasResult}
              className={`w-full rounded-xl px-6 py-4 font-semibold transition-all ${
                hasResult
                  ? "bg-gradient-to-r from-[#9D00FF] to-[#B84CFF] text-white hover:from-[#7A00CC] hover:to-[#9D00FF] shadow-[0_0_20px_rgba(157,0,255,0.35)]"
                  : "bg-gray-600 text-gray-400 cursor-not-allowed"
              }`}
            >
              {outputParts.length > 0
                ? "📦 Baixar todas as partes"
                : "📄 Baixar CSV processado"}
            </button>

            {outputParts.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm text-gray-200 p-3 bg-blue-900/20 border border-blue-600/30 rounded-lg">
                  <strong>Arquivo dividido</strong> em {outputParts.length} partes
                  (máx. 5.000 registros por parte).
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {outputParts.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => triggerDownloadBlob(p.blob, p.name)}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-all"
                    >
                      Parte {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-gray-300 p-3 bg-gray-700/30 rounded-lg">
              <p className="mb-1">
                <strong>Formato de saída:</strong> delimitador{" "}
                <span className="text-[#B84CFF]">;</span>
              </p>
              <p className="italic">
                Cabeçalhos: Nome, Telefone, Email, Sexo, Data de nascimento, Data de
                cadastro, Pontos do fidelidade, Rua, Número, Complemento, Bairro,
                CEP, Cidade, Estado
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
