// src/components/Conversor.jsx
import { useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

/**
 * Conversor .XLSX → .CSV (delimitador fixo: vírgula)
 * - 100% no navegador (sem backend)
 * - Escolha da aba
 * - Prévia das primeiras linhas
 * - Divide automaticamente em partes de até 5.000 linhas (mantendo o cabeçalho)
 */
export default function Conversor() {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [preview, setPreview] = useState([]);
  const [parts, setParts] = useState([]); // [{name, blob}]
  const [info, setInfo] = useState("");

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
        setInfo(`Arquivo com ${names.length} aba(s).`);
      }
    } catch {
      setInfo("Falha ao ler o arquivo. Verifique se é um XLSX válido.");
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
      setInfo("Aba não encontrada.");
      return;
    }

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) || [];
    if (rows.length === 0) {
      setInfo("Aba vazia.");
      return;
    }

    const [header, ...dataRows] = rows;
    const CHUNK = 5000;
    const slices = splitArray(dataRows, CHUNK);

    const base = (fileName || "planilha").replace(/\.(xlsx|xlsm|xls|xlsb)$/i, "");
    const generated = (slices.length ? slices : [dataRows]).map((slice, idx) => {
      // delimitador fixo: vírgula
      const csv = Papa.unparse([header, ...slice], { delimiter: "," });
      const name =
        slices.length > 1
          ? `${base}_${selectedSheet}_parte_${idx + 1}.csv`
          : `${base}_${selectedSheet}.csv`;
      return { name, blob: new Blob([csv], { type: "text/csv;charset=utf-8" }) };
    });

    setParts(generated);
    setInfo(
      `Conversão concluída${slices.length > 1 ? ` • geradas ${slices.length} partes` : ""}.`
    );
  }

  /* ====== UI com tema roxo/vidro ====== */
  const card =
    "rounded-2xl border border-[#9D00FF]/30 bg-black/40 backdrop-blur-lg p-6 md:p-8 shadow-[0_0_20px_rgba(157,0,255,0.25)]";
  const badge =
    "w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center bg-gradient-to-r from-[#9D00FF] to-[#B84CFF]";
  const field =
    "w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#9D00FF] focus:border-[#9D00FF] text-sm";
  const subtle =
    "text-gray-300 bg-gray-800/50 rounded-xl p-4 border border-gray-700";

  return (
    <div className={card}>
      <div className="flex items-center gap-4 mb-6">
        <div className={badge}>
          <span className="text-2xl">🔄</span>
        </div>
        <div>
          <h3 className="text-2xl font-bold">Conversor .XLSX → .CSV</h3>
          <p className="text-gray-300 text-sm mt-1">
            Converte Excel para CSV (vírgula) e divide automaticamente em partes de
            5.000 linhas.
          </p>
        </div>
      </div>

      {/* Linha de seleção de arquivo + sheet */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm text-gray-300 mb-2">Arquivo Excel</label>
          <input
            id="xlsx-input"
            type="file"
            accept=".xlsx,.xlsm,.xlsb,.xls"
            onChange={handleXlsx}
            className={field + " file:mr-4 file:py-2.5 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#9D00FF] file:text-white hover:file:bg-[#7A00CC] file:transition-all file:cursor-pointer"}
          />
          {fileName && (
            <div className="mt-2 text-xs text-gray-400 truncate" title={fileName}>
              {fileName}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-2">Aba (planilha)</label>
          <select
            value={selectedSheet}
            onChange={(e) => onChangeSheet(e.target.value)}
            className={field}
            disabled={sheets.length === 0}
          >
            {sheets.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Botões + status */}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={convertSelectedSheet}
          className="rounded-xl bg-gradient-to-r from-[#9D00FF] to-[#B84CFF] hover:from-[#7A00CC] hover:to-[#9D00FF] text-white px-5 py-2.5 text-sm font-semibold shadow-[0_0_16px_rgba(157,0,255,0.35)] disabled:opacity-50"
          disabled={!selectedSheet}
        >
          Converter aba selecionada
        </button>

        {parts.length > 0 && (
          <div className="text-xs text-gray-300">
            Partes geradas: <b>{parts.length}</b>
          </div>
        )}
      </div>

      {info && (
        <div className={subtle + " mt-4 text-sm"}>
          {info}
        </div>
      )}

      {/* Prévia */}
      {preview.length > 0 && (
        <div className="space-y-2 mt-6">
          <h4 className="text-sm font-semibold text-white">Prévia (primeiras linhas)</h4>
          <div className="overflow-auto rounded-xl border border-gray-700 bg-gray-800/50">
            <table className="min-w-full text-sm">
              <tbody>
                {preview.map((r, idx) => (
                  <tr key={idx} className="odd:bg-gray-700/30 even:bg-gray-800/30">
                    {(r || []).map((c, i) => (
                      <td
                        key={i}
                        className="px-4 py-3 border-r border-gray-700 last:border-r-0 text-gray-200"
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

      {/* Downloads */}
      {parts.length > 0 && (
        <div className="mt-6">
          <div className="text-sm text-gray-200 mb-2">Baixar CSV(s):</div>
          <div className="flex flex-wrap gap-2">
            {parts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => triggerDownloadBlob(p.blob, p.name)}
                className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-800/60 text-gray-200 hover:bg-gray-700/60 text-sm"
                title={p.name}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
