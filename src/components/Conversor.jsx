import { useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

/**
 * Conversor .XLSX → .CSV (vírgula)
 * - 100% no navegador
 * - Escolha de aba, prévia e split em partes de 5.000 linhas (mantém cabeçalho)
 * - Visual aprimorado + acessibilidade
 */
export default function Conversor() {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [preview, setPreview] = useState([]);
  const [parts, setParts] = useState([]); // [{name, blob}]
  const [info, setInfo] = useState("");

  const card =
    "rounded-3xl p-8 border backdrop-blur-xl bg-white/80 dark:bg-black/40 " +
    "border-purple-300/50 dark:border-purple-500/30 shadow-[0_8px_32px_rgba(139,92,246,0.2)] " +
    "hover:shadow-[0_12px_48px_rgba(139,92,246,0.3)] transition-all duration-300";

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

  function splitArray(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  async function handleXlsx(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSheets([]);
    setSelectedSheet("");
    setPreview([]);
    setParts([]);
    setInfo("");

    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { dense: true });
      const names = wb.SheetNames || [];
      setSheets(names);

      if (names[0]) {
        setSelectedSheet(names[0]);
        const ws = wb.Sheets[names[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) || [];
        setPreview(rows.slice(0, 5));
        setInfo(`📊 Arquivo com ${names.length} aba(s).`);
      }
    } catch {
      setInfo("❌ Falha ao ler o arquivo. Verifique se é um XLSX válido.");
    }
  }

  async function onChangeSheet(name) {
    setSelectedSheet(name);
    setParts([]);
    setInfo("");

    const input = document.getElementById("xlsx-input");
    const file = input?.files?.[0];
    if (!file) return;

    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { dense: true });
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) || [];
    setPreview(rows.slice(0, 5));
  }

  async function convertSelectedSheet() {
    if (!selectedSheet) return;
    const input = document.getElementById("xlsx-input");
    const file = input?.files?.[0];
    if (!file) return;

    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { dense: true });
    const ws = wb.Sheets[selectedSheet];
    if (!ws) {
      setInfo("❌ Aba não encontrada.");
      return;
    }

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) || [];
    if (rows.length === 0) {
      setInfo("⚠️ Aba vazia.");
      return;
    }

    const [header, ...dataRows] = rows;
    const CHUNK = 5000;
    const slices = splitArray(dataRows, CHUNK);

    const base = (fileName || "planilha").replace(/\.(xlsx|xlsm|xls|xlsb)$/i, "");
    const generated = (slices.length ? slices : [dataRows]).map((slice, idx) => {
      const csv = Papa.unparse([header, ...slice], { delimiter: "," });
      const name =
        slices.length > 1
          ? `${base}_${selectedSheet}_parte_${idx + 1}.csv`
          : `${base}_${selectedSheet}.csv`;
      return { name, blob: new Blob([csv], { type: "text/csv;charset=utf-8" }) };
    });

    setParts(generated);
    setInfo(
      `✅ Conversão concluída${slices.length > 1 ? ` • geradas ${slices.length} partes.` : "."}`
    );
  }

  return (
    <section className={card}>
      <div className="flex items-center gap-6 mb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-500 via-violet-600 to-purple-700 shadow-lg shadow-purple-500/30 border border-purple-400/30">
          <span className="text-3xl">🔄</span>
        </div>
        <div>
          <h3 className="text-3xl font-bold text-gray-800 dark:text-white">
            Conversor Excel → CSV
          </h3>
          <p className="text-gray-600 dark:text-gray-300 text-lg mt-2">
            Converte Excel para CSV (vírgula) e divide em partes de 5.000 linhas.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2">
          <label className="block text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">
            📁 Arquivo Excel
          </label>
          <input
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
              <option key={n} value={n} className="bg-gray-50 dark:bg-slate-800">
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={convertSelectedSheet}
          disabled={!selectedSheet}
          className="rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white px-8 py-4 text-lg font-bold shadow-[0_8px_32px_rgba(139,92,246,0.35)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02]"
        >
          🚀 Converter aba selecionada
        </button>

        {parts.length > 0 && (
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 bg-purple-100/80 dark:bg-purple-900/30 px-4 py-2 rounded-lg border border-purple-300/50 dark:border-purple-500/30">
            <span className="text-lg">📦</span>
            <span className="font-medium">
              Partes geradas: <strong>{parts.length}</strong>
            </span>
          </div>
        )}
      </div>

      {info && (
        <div className="mb-8 p-4 bg-gradient-to-r from-gray-100/80 dark:from-slate-700/60 to-purple-100/80 dark:to-purple-800/60 rounded-xl border border-purple-300/50 dark:border-purple-500/30 text-gray-700 dark:text-gray-200">
          {info}
        </div>
      )}

      {preview.length > 0 && (
        <div className="mb-8">
          <h4 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span>👁️</span> Prévia (primeiras 5 linhas)
          </h4>
          <div className="overflow-auto rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 backdrop-blur-lg">
            <table className="min-w-full text-sm">
              <tbody>
                {preview.map((r, idx) => (
                  <tr
                    key={idx}
                    className={`${idx % 2 === 0 ? "bg-gray-50 dark:bg-slate-700/40" : "bg-white dark:bg-slate-800/60"} transition-colors`}
                  >
                    {(r || []).map((c, i) => (
                      <td
                        key={i}
                        className="px-4 py-4 border-r border-purple-200/50 dark:border-purple-500/20 last:border-r-0 text-gray-700 dark:text-gray-200 font-medium"
                      >
                        {String(c ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {parts.length > 0 && (
        <div className="rounded-2xl border border-purple-300/50 dark:border-purple-500/30 bg-white/90 dark:bg-slate-800/60 p-6 backdrop-blur-lg">
          <h4 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span>💾</span> Baixar CSV(s)
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {parts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => triggerDownloadBlob(p.blob, p.name)}
                title={p.name}
                className="px-4 py-3 rounded-xl border border-purple-300/50 dark:border-purple-500/30 bg-gradient-to-br from-gray-100/80 dark:from-slate-700/60 to-purple-100/80 dark:to-purple-800/40 text-gray-700 dark:text-gray-200 hover:from-gray-200/80 dark:hover:from-slate-600/80 hover:to-purple-200/80 dark:hover:to-purple-700/60 font-medium transition-all duration-200 hover:scale-[1.02] shadow-lg"
              >
                {p.name.length > 28 ? `📄 Parte ${idx + 1}` : `📄 ${p.name}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
