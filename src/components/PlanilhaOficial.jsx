import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";

/* ========== Helpers de string ========== */
function softTrim(v) {
  return String(v ?? "")
    .replace(/\uFEFF/g, "") // BOM
    .replace(/\u00A0/g, " ") // NBSP
    .trim();
}
function onlyDigits(v) {
  return softTrim(v).replace(/\D/g, "");
}

/* ========== Config de telefone (incrementos sem afrouxar regras) ========== */
/** NÃO permitir fixo (mantido) */
const ALLOW_LANDLINE = false;
/** Inserir '9' quando vierem 10 dígitos (compatível com seu código antigo) */
const INFER_MISSING_9 = true;
/** Validar DDD estritamente? (mantemos desativado para não derrubar válidos) */
const STRICT_DDD = false;
/** Rejeitar sequências óbvias 000..., 111... (opcional; ligado) */
const REJECT_OBVIOUS_FAKE = true;
/** Modo de saída do telefone: "br" | "digits" | "e164" */
const PHONE_OUT_MODE = "br";

/* ========== DDDs válidos (usado só se STRICT_DDD=true) ========== */
const VALID_DDDS = new Set([
  "11","12","13","14","15","16","17","18","19",
  "21","22","24","27","28",
  "31","32","33","34","35","37","38",
  "41","42","43","44","45","46",
  "47","48","49",
  "51","53","54","55",
  "61","62","63","64","65","66","67","68","69",
  "71","73","74","75","77",
  "79",
  "81","82","83","84","85","86","87","88","89",
  "91","92","93","94","95","96","97","98","99"
]);

function isObviousFake(s) {
  if (!s) return true;
  if (/^(\d)\1+$/.test(s)) return true; // 000000..., 111111...
  if (/^0+$/.test(s)) return true;
  return false;
}

/* ========== Normalização + Validação (mobile only) ========== */
function normalizeMobileDigits(number) {
  let s = onlyDigits(number);
  if (s.startsWith("55")) s = s.slice(2);
  if (INFER_MISSING_9 && s.length === 10) {
    s = s.slice(0, 2) + "9" + s.slice(2);
  }
  return s;
}
function isValidBrazilianMobile(number) {
  const s = normalizeMobileDigits(number);
  if (s.length !== 11) return false;
  const ddd = s.slice(0, 2);
  const subscriber = s.slice(2);
  if (STRICT_DDD && !VALID_DDDS.has(ddd)) return false;
  if (REJECT_OBVIOUS_FAKE && (isObviousFake(s) || isObviousFake(subscriber))) return false;
  return subscriber[0] === "9"; // só celular
}
function formatBrazilianNumber(number, mode = PHONE_OUT_MODE) {
  let s = normalizeMobileDigits(number);
  if (mode === "digits") return s || "";
  if (mode === "e164") return s ? "+55" + s : "";
  if (s.length === 11) return `(${s.slice(0, 2)})${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 2)})${s.slice(2, 6)}-${s.slice(6)}`;
  return "";
}

/* ========== Email & Pontos (campos não deletam linha) ========== */
function isValidEmail(email) {
  const e = softTrim(email);
  if (!e) return true; // vazio é permitido
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(e);
}
function normalizePoints(points) {
  const raw = softTrim(points);
  if (!raw) return "";
  return raw.replace(/\D/g, ""); // apenas dígitos
}

/* ========== Delimitador ========== */
const CANDIDATE_DELIMS = [",", ";", "\t", "|"];
function heuristicDelimiterDetect(sampleText = "") {
  const counts = CANDIDATE_DELIMS.map((d) => ({
    d,
    n: (sampleText.match(new RegExp(`\\${d}`, "g")) || []).length,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0]?.d || ",";
}

/* ========== URL do "banco simples" (Google Apps Script) ========== */
const SIMPLE_DB_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbyi7CIehrRNSvCq76P8K0wLqP7uygF2g5KYBwlKtf0_Uo8_bPdAEDITSWhSHtpeaemFmg/exec";

/* ========== Modelo de saída ========== */
const MODEL_HEADERS = [
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

/* ========== Aliases (Telefone + WhatsApp — fallback) ========== */
const HEADER_ALIASES = {
  nome: [
    "nome","name","cliente","full name","nome completo","nome do cliente","cliente_nome","nomecliente"
  ],
  telefone: [
    "telefone","celular","phone","telefone1","tel","fone","mobile","cellphone","cell","contato",
    "movel","telemovel","número","numero","telefone 1","telefone principal"
  ],
  whatsapp: ["whatsapp","whats","zap","wa","whatsapp1","zap1"],
  email: ["email","e-mail","mail","e mail","email1","email principal"],
  pontos: [
    "pontos do fidelidade","pontos","fidelidade","pontuacao","pontuação","pontos_fidelidade",
    "score","loyalty","pontos fidelidade","saldo pontos"
  ],
};

/* ========== Mapear índices por cabeçalho (com WA fallback) ========== */
function mapHeaderIndexes(headerRow = []) {
  const lowered = headerRow.map((c) =>
    softTrim(c).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );
  const findOne = (keys) => {
    for (const k of keys) {
      const kk = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const idx = lowered.indexOf(kk);
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const nome = findOne(HEADER_ALIASES.nome);
  let telefone = findOne(HEADER_ALIASES.telefone);
  let whatsapp = findOne(HEADER_ALIASES.whatsapp);
  // Se não houver “telefone”, usa “whatsapp” como principal
  if (telefone === -1 && whatsapp !== -1) {
    telefone = whatsapp;
    whatsapp = -1;
  }
  const email = findOne(HEADER_ALIASES.email);
  const pontos = findOne(HEADER_ALIASES.pontos);
  return { nome, telefone, whatsapp, email, pontos };
}

/* ========== Heurística sem cabeçalho ========== */
const LOW_CONF_THRESHOLD = 0.35;

function guessIndexesByContent(rows, sampleSize = 150) {
  const N = Math.min(sampleSize, rows.length);
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const score = Array.from({ length: width }, () => ({
    phone: 0,
    email: 0,
    points: 0,
    name: 0,
  }));

  for (let i = 0; i < N; i++) {
    const r = rows[i] || [];
    for (let c = 0; c < width; c++) {
      const v = softTrim(r[c]);
      if (!v) continue;

      const digits = onlyDigits(v);
      const looks10or11 = digits.startsWith("55")
        ? [10, 11].includes(digits.slice(2).length)
        : [10, 11].includes(digits.length);
      if (isValidBrazilianMobile(v)) score[c].phone += 6;
      else if (looks10or11) score[c].phone += 3;
      else if (/\d/.test(v)) score[c].phone += 0.2;

      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(v)) score[c].email += 4;
      if (digits.length > 0) score[c].points += 1;

      const letters = (v.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      const digitsCount = (v.match(/\d/g) || []).length;
      if (letters >= 3 && digitsCount === 0 && v.length <= 80) score[c].name += 1.2;
      if (/\s/.test(v)) score[c].name += 0.3;
    }
  }

  const best = (col) => score.map((s, i) => ({ i, v: s[col] })).sort((a, b) => b.v - a.v);

  const bestPhone  = best("phone");
  const bestEmail  = best("email");
  const bestPoints = best("points");
  const bestName   = best("name");

  const telefone = bestPhone[0]?.i ?? -1;

  // “Whatsapp” como 2º melhor candidato a phone
  let whatsapp = -1;
  for (let k = 1; k < bestPhone.length; k++) {
    if (bestPhone[k].i !== telefone && bestPhone[k].v > 0) { whatsapp = bestPhone[k].i; break; }
  }

  const email  = bestEmail[0]?.i ?? -1;
  const pontos = bestPoints[0]?.i ?? -1;

  let nome = -1;
  for (const cand of bestName) {
    if (![telefone, whatsapp, email, pontos].includes(cand.i)) { nome = cand.i; break; }
  }

  const conf = (arr) => {
    const v1 = arr[0]?.v ?? 0, v2 = arr[1]?.v ?? 0;
    return v1 <= 0 ? 0 : (v1 - v2) / v1;
  };
  const confidence = {
    telefone: conf(bestPhone),
    email:    conf(bestEmail),
    pontos:   conf(bestPoints),
    nome:     conf(bestName),
  };

  return { nome, telefone, whatsapp, email, pontos, confidence };
}

/* ========== CSV de saída (modelo oficial) ========== */
function buildOutputCSV(rows) {
  const padded = rows.map((r) => [
    r.nome ?? "Cliente",
    r.telefone ?? "",
    r.email ?? "",
    "", "", "", // Sexo, Nascimento, Cadastro
    r.pontos ?? "",
    "", "", "", "", "", "", "" // Endereço
  ]);
  return Papa.unparse({ fields: MODEL_HEADERS, data: padded }, { delimiter: ";" });
}

function splitArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ========== Componente ========== */
export default function PlanilhaOficial() {
  const [rawPreview, setRawPreview] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const allRowsRef = useRef([]);

  const [report, setReport] = useState({
    totalLidas: 0,
    totalValidas: 0,
    deletadas: {
      invalid_telefone: 0,
      invalid_whatsapp: 0,
      invalid_both: 0,
      no_valid_number: 0,
      invalid_format: 0,
      invalid_email: 0,   // não deleta (info)
      invalid_points: 0,  // não deleta (info)
      used_whatsapp_fallback: 0, // info
    },
    linhasDeletadas: [],
  });

  const [outputCSV, setOutputCSV] = useState("");
  const [outputParts, setOutputParts] = useState([]); // [{name, blob}]
  const [fileName, setFileName] = useState("clientes_processados.csv");
  const inputRef = useRef(null);
  const [deletedParts, setDeletedParts] = useState([]); // [{name, blob}]

  /* ======= DEBUG ======= */
  const [debugOpen, setDebugOpen] = useState(false);
  const [debug, setDebug] = useState({
    triedDelims: [],
    chosenDelimiter: "",
    headerDetected: false,
    headerRow: [],
    headerMap: null,
    guessedMap: null,
    sampleExtract: [],
    lowConfidence: false,
    lowConfidenceReason: "",
  });

  /* ======= Mapeamento Manual ======= */
  const [mapUI, setMapUI] = useState({
    open: false,
    hasHeader: false,
    selected: { nome: -1, telefone: -1, whatsapp: -1, email: -1, pontos: -1 },
    options: [],
  });

  /* ======= Mostrar/Esconder métricas — começa escondido ======= */
  const [showDeletedSummary, setShowDeletedSummary] = useState(false);

  /* ======= Prévia da planilha corrigida (3 primeiras linhas) ======= */
  const [previewRows, setPreviewRows] = useState([]);

  /* ======= Modal para salvar no "banco simples" ======= */
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [pendingDownloadAction, setPendingDownloadAction] = useState(null); // "single" | "allParts"
  const [saveForm, setSaveForm] = useState({
    atendente: "",
    estabelecimento: "",
    portal: "",
  });
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  /* ======= CSVs para envio ao Apps Script ======= */
  const [originalCSV, setOriginalCSV] = useState("");   // planilha importada (bruta)
  const [fullOutputCSV, setFullOutputCSV] = useState(""); // planilha corrigida (completa)

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
    setAllRows([]);
    allRowsRef.current = [];
    setReport({
      totalLidas: 0,
      totalValidas: 0,
      deletadas: {
        invalid_telefone: 0,
        invalid_whatsapp: 0,
        invalid_both: 0,
        no_valid_number: 0,
        invalid_format: 0,
        invalid_email: 0,
        invalid_points: 0,
        used_whatsapp_fallback: 0,
      },
      linhasDeletadas: [],
    });
    setOutputCSV("");
    setOutputParts([]);
    setDeletedParts([]);
    setFileName("clientes_processados.csv");
    setDebug({
      triedDelims: [],
      chosenDelimiter: "",
      headerDetected: false,
      headerRow: [],
      headerMap: null,
      guessedMap: null,
      sampleExtract: [],
      lowConfidence: false,
      lowConfidenceReason: "",
    });
    setMapUI({
      open: false,
      hasHeader: false,
      selected: { nome: -1, telefone: -1, whatsapp: -1, email: -1, pontos: -1 },
      options: [],
    });
    setShowDeletedSummary(false);
    setPreviewRows([]);
    setSaveModalOpen(false);
    setPendingDownloadAction(null);
    setSaveForm({ atendente: "", estabelecimento: "", portal: "" });
    setSaveError("");
    setIsSaving(false);
    setOriginalCSV("");
    setFullOutputCSV("");
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

  function handleDownloadAllParts() {
    if (!outputParts.length) return;
    outputParts.forEach((p) => triggerDownloadBlob(p.blob, p.name));
  }

  function handleDownloadSingle() {
    if (outputCSV) {
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

  function openSaveModal(action) {
    if (!hasResult) return;
    setPendingDownloadAction(action);
    setSaveError("");
    setSaveModalOpen(true);
  }

  function closeSaveModal() {
    if (isSaving) return;
    setSaveModalOpen(false);
    setPendingDownloadAction(null);
  }

  function handleChangeSaveField(field, value) {
    setSaveForm((prev) => ({ ...prev, [field]: value }));
  }
  async function handleConfirmAndDownload(e) {
    e.preventDefault();

    const atendente = saveForm.atendente.trim();
    const estabelecimento = saveForm.estabelecimento.trim();
    const portal = saveForm.portal.trim();

    // Campos obrigatórios
    if (!atendente || !estabelecimento || !portal) {
      setSaveError("Preencha todos os campos obrigatórios.");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    // Payload completo que o Apps Script espera
    const payload = {
      nomeAtendente: atendente,
      nomeEstabelecimento: estabelecimento,
      portalEstabelecimento: portal,
      csvImportada: originalCSV || "",
      csvCorrigida: fullOutputCSV || outputCSV || "",
    };

    try {
      // Envia para o Apps Script sem esbarrar em CORS
      await fetch(SIMPLE_DB_WEB_APP_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify(payload),
      });
      // Em "no-cors" não dá para ler resposta, mas o pedido é enviado.
    } catch (err) {
      console.error("Erro ao enviar para o banco:", err);
      // Mesmo se der erro aqui, não vamos travar o download
    }

    // Depois de tentar salvar, faz o download
    if (pendingDownloadAction === "single") {
      handleDownloadSingle();
    } else if (pendingDownloadAction === "allParts") {
      handleDownloadAllParts();
    }

    // Fecha modal e reseta apenas o formulário
    setSaveModalOpen(false);
    setPendingDownloadAction(null);
    setSaveForm({ atendente: "", estabelecimento: "", portal: "" });
    setIsSaving(false);
  }

  /* ========== Upload/Leitura de arquivo ========== */
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // limpa prévia anterior
    setPreviewRows([]);

    // Lê o conteúdo completo para poder enviar como "csvImportada"
    const originalText = await file.text();
    setOriginalCSV(originalText);

    // Usa apenas o início para heurística de delimitador
    const firstChunk = originalText.slice(0, 8192);
    const detected = heuristicDelimiterDetect(firstChunk);

    const tryDelims = [",", ";", "\t", "|"].sort((a, b) =>
      a === detected ? -1 : b === detected ? 1 : 0
    );

    const tried = [];
    const tryParse = (delimiter) =>
      new Promise((resolve) => {
        Papa.parse(file, {
          header: false,
          dynamicTyping: false,
          skipEmptyLines: "greedy",
          delimiter,
          complete: (res) => resolve({ ok: true, delimiter, data: res.data }),
          error: () => resolve({ ok: false, delimiter, data: [] }),
        });
      });

    let rows = [];
    let chosen = "";
    for (const d of tryDelims) {
      const res = await tryParse(d);
      const cols = res.data?.[0]?.length ?? 0;
      tried.push({ delimiter: d, rows: res.data?.length ?? 0, cols });
      if (res.ok && res.data?.length && cols > 1) {
        rows = res.data;
        chosen = d;
        break;
      }
      if (!rows.length) {
        rows = res.data || [];
        chosen = d;
      }
    }

    if ((!rows.length || (rows[0]?.length ?? 0) <= 1) && chosen !== ";") {
      const res = await tryParse(";");
      const cols = res.data?.[0]?.length ?? 0;
      tried.push({ delimiter: ";(forced)", rows: res.data?.length ?? 0, cols });
      if (res.ok && res.data?.length && cols > 1) {
        rows = res.data;
        chosen = ";";
      }
    }

    setDebug((prev) => ({ ...prev, triedDelims: tried, chosenDelimiter: chosen }));

    if (!rows.length) {
      alertCsvFail();
      return;
    }

    setAllRows(rows);
    allRowsRef.current = rows;
    processData(rows);
  }

  /* ========== Painel Manual: helpers ========== */
  function buildMapOptions(rowsSrc) {
    const width = rowsSrc.reduce((m, r) => Math.max(m, r.length), 0);
    const samples = (col) => {
      const vals = [];
      for (let i = 0; i < Math.min(5, rowsSrc.length); i++) {
        const v = softTrim(rowsSrc[i]?.[col]);
        if (v) vals.push(v);
      }
      const preview = vals.slice(0, 3).join(" | ");
      return preview.length > 80 ? preview.slice(0, 77) + "..." : preview;
    };
    const options = [];
    for (let i = 0; i < width; i++) {
      options.push({ value: i, label: `Col ${i + 1} — ${samples(i) || "(vazio)"}` });
    }
    return options;
  }

  function openMapPanel(currentMap, hasHeader, lowReason = "", rowsSrc) {
    const baseRows = rowsSrc || allRowsRef.current;
    if (!baseRows.length) return;

    setMapUI({
      open: true,
      hasHeader: !!hasHeader,
      selected: {
        nome: currentMap?.nome ?? -1,
        telefone: currentMap?.telefone ?? -1,
        whatsapp: currentMap?.whatsapp ?? -1,
        email: currentMap?.email ?? -1,
        pontos: currentMap?.pontos ?? -1,
      },
      options: buildMapOptions(baseRows),
    });

    setDebug((prev) => ({
      ...prev,
      lowConfidence: true,
      lowConfidenceReason: lowReason || prev.lowConfidenceReason,
    }));
  }

  function canApplyMap(sel) {
    // Mínimo: Nome e (Telefone OU WhatsApp)
    return sel && sel.nome >= 0 && (sel.telefone >= 0 || sel.whatsapp >= 0);
  }

  function applyManualMap() {
    const sel = mapUI.selected;
    if (!canApplyMap(sel)) {
      alert("Selecione ao menos Nome e Telefone (ou WhatsApp).");
      return;
    }
    const forced = { map: sel, hasHeader: mapUI.hasHeader };
    processData(allRowsRef.current, forced);
    setMapUI((p) => ({ ...p, open: false }));
  }

  /* ========== Processamento ========== */
  function processData(rows, override /* {map, hasHeader} opcional */) {
    try {
      if (!Array.isArray(rows) || rows.length === 0) {
        alertCsvFail();
        return;
      }

      setRawPreview(rows.slice(0, 5));

      // 1) Detectar cabeçalho e mapeamento
      let startIndex = 0;
      let headerMap = null;
      let headerDetected = false;

      if (override?.map) {
        headerMap = override.map;
        headerDetected = !!override.hasHeader;
        startIndex = override.hasHeader ? 1 : 0;

        setDebug((prev) => ({
          ...prev,
          headerDetected,
          headerRow: headerDetected ? (rows[0]?.map(softTrim) || []) : [],
          headerMap,
          guessedMap: null,
          lowConfidence: false,
          lowConfidenceReason: "",
        }));
      } else {
        const headerRow = rows[0]?.map(softTrim);
        const maybeHeaderLower =
          headerRow?.map((c) =>
            c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          ) || [];

        const looksLikeHeader =
          headerRow &&
          (HEADER_ALIASES.nome.some((h) => maybeHeaderLower.includes(h)) ||
            HEADER_ALIASES.telefone.some((h) => maybeHeaderLower.includes(h)) ||
            HEADER_ALIASES.whatsapp.some((h) => maybeHeaderLower.includes(h)) ||
            HEADER_ALIASES.email.some((h) => maybeHeaderLower.includes(h)) ||
            HEADER_ALIASES.pontos.some((h) => maybeHeaderLower.includes(h)));

        if (looksLikeHeader) {
          headerMap = mapHeaderIndexes(headerRow);
          startIndex = 1;
          headerDetected = true;
        }

        let guessed = null;
        if (!headerMap || Object.values(headerMap).every((v) => v < 0)) {
          guessed = guessIndexesByContent(rows.slice(startIndex, startIndex + 200));
          headerMap = guessed;
        }

        const lowReasons = [];
        let lowConfidence = false;
        if (!headerDetected) {
          const confPhone = headerMap?.confidence?.telefone ?? 0;
          if (confPhone < LOW_CONF_THRESHOLD) {
            lowConfidence = true;
            lowReasons.push(
              `Baixa confiança na detecção de Telefone (${(confPhone * 100).toFixed(
                0
              )}%).`
            );
          }
          if (
            (headerMap?.telefone ?? -1) === -1 &&
            (headerMap?.whatsapp ?? -1) === -1
          ) {
            lowConfidence = true;
            lowReasons.push("Não foi possível definir a coluna de Telefone/WhatsApp.");
          }
        } else {
          if (
            (headerMap?.telefone ?? -1) === -1 &&
            (headerMap?.whatsapp ?? -1) === -1
          ) {
            lowConfidence = true;
            lowReasons.push(
              "Cabeçalho encontrado, mas Telefone/WhatsApp não foi mapeado."
            );
          }
        }

        setDebug((prev) => ({
          ...prev,
          headerDetected: Boolean(headerDetected),
          headerRow: rows[0]?.map(softTrim) || [],
          headerMap,
          guessedMap: guessed || null,
          lowConfidence,
          lowConfidenceReason: lowReasons.join(" "),
        }));

        if (lowConfidence) {
          openMapPanel(headerMap, headerDetected, lowReasons.join(" "), rows);
        }
      }

      const deleted = {
        invalid_telefone: 0,
        invalid_whatsapp: 0,
        invalid_both: 0,
        no_valid_number: 0,
        invalid_format: 0,
        invalid_email: 0, // info
        invalid_points: 0, // info
        used_whatsapp_fallback: 0,
      };

      const linhasDeletadas = [];
      const processadas = [];
      const deletedRowsData = [];

      let totalLidas = 0;
      const pick = (row, idx) => (idx >= 0 ? softTrim(row[idx]) : "");

      const sample = [];

      for (let i = startIndex; i < rows.length; i += 1) {
        const rowNum = i + 1;
        const row = rows[i] || [];

        const nomeRaw = pick(row, headerMap?.nome ?? -1);
        const telefoneRaw = pick(row, headerMap?.telefone ?? -1);
        const whatsappRaw = pick(row, headerMap?.whatsapp ?? -1);
        const emailRaw = pick(row, headerMap?.email ?? -1);
        const pontosRaw = pick(row, headerMap?.pontos ?? -1);

        totalLidas += 1;

        // === Telefone preferencial + fallback WhatsApp ===
        let chosenSource = "";
        let finalPhone = "";
        let reason = null;

        const telHas = Boolean(softTrim(telefoneRaw));
        const waHas = Boolean(softTrim(whatsappRaw));
        const telOk = telHas && isValidBrazilianMobile(telefoneRaw);
        const waOk = waHas && isValidBrazilianMobile(whatsappRaw);

        if (telOk) {
          finalPhone = formatBrazilianNumber(telefoneRaw);
          chosenSource = "telefone";
        } else if (!telHas && waOk) {
          // telefone vazio → tenta whatsapp
          finalPhone = formatBrazilianNumber(whatsappRaw);
          chosenSource = "whatsapp";
          deleted.used_whatsapp_fallback += 1;
        } else if (telHas && !telOk && waOk) {
          // telefone inválido → fallback no whatsapp
          finalPhone = formatBrazilianNumber(whatsappRaw);
          chosenSource = "whatsapp";
          deleted.used_whatsapp_fallback += 1;
        } else {
          // Nenhum válido → classifica motivo
          if (telHas && waHas && !telOk && !waOk) {
            reason = "invalid_both";
          } else if (telHas && !telOk) {
            reason = "invalid_telefone";
          } else if (waHas && !waOk) {
            reason = "invalid_whatsapp";
          } else {
            reason = "no_valid_number";
          }
        }

        // Nome vazio NÃO deleta
        const nomeOut = nomeRaw || "Cliente";

        // Email inválido → apaga o campo (não deleta)
        const emailValid = isValidEmail(emailRaw);
        const emailOut = emailValid ? emailRaw : "";
        if (!emailValid) deleted.invalid_email += 1;

        // Pontos → só dígitos (não deleta)
        const pontosOut = normalizePoints(pontosRaw);
        if (pontosRaw && pontosOut === "") deleted.invalid_points += 1;

        if (reason) {
          linhasDeletadas.push(rowNum);
          deletedRowsData.push({
            "Linha original": rowNum,
            Motivo: reason,
            Nome: nomeRaw,
            Telefone: telefoneRaw,
            Whatsapp: whatsappRaw,
            Email: emailRaw,
            "Pontos do fidelidade": pontosRaw,
          });
          deleted[reason] += 1;
        } else {
          processadas.push({
            nome: nomeOut,
            telefone: finalPhone,
            email: emailOut,
            pontos: pontosOut,
          });
        }

        // Debug (primeiras 10)
        if (sample.length < 10) {
          const pontosShow =
            pontosOut === "" && pontosRaw ? "(apagado)" : pontosOut;
          const emailShow = emailOut === "" && emailRaw ? "(apagado)" : emailOut;

          sample.push({
            rowNum,
            nome: nomeRaw,
            telefone: telefoneRaw,
            whatsapp: whatsappRaw,
            telDigits: onlyDigits(telefoneRaw),
            waDigits: onlyDigits(whatsappRaw),
            telValid: telOk,
            waValid: waOk,
            chosen: finalPhone || "",
            chosenSource,
            email: emailRaw,
            emailValid,
            emailOut: emailShow,
            pontosRaw,
            pontosOut: pontosShow,
            reason: reason || "",
          });
        }
      }

      // Debug amostra
      setDebug((prev) => ({ ...prev, sampleExtract: sample }));

      // Atualiza pré-visualização (primeiras 3 linhas da planilha corrigida)
      setPreviewRows(processadas.slice(0, 3));

      // Monta CSV completo de saída (corrigido) para enviar ao Apps Script
      const fullCsvOut = buildOutputCSV(processadas);
      setFullOutputCSV(fullCsvOut);

      // Saída válida (chunk de 5000) – para DOWNLOAD
      const CHUNK = 5000;
      if (processadas.length > CHUNK) {
        const slices = splitArray(processadas, CHUNK);
        const parts = slices.map((slice, idx) => {
          const csvStr = buildOutputCSV(slice);
          return {
            name: `${(fileName || "clientes_processados").replace(
              /\.csv$/i,
              ""
            )}_parte_${idx + 1}.csv`,
            blob: new Blob([csvStr], { type: "text/csv;charset=utf-8" }),
          };
        });
        setOutputParts(parts);
        setOutputCSV("");
      } else {
        setOutputCSV(fullCsvOut);
        setOutputParts([]);
      }

      // CSV de deletados
      if (deletedRowsData.length > 0) {
        const delSlices = splitArray(deletedRowsData, CHUNK);
        const delParts = delSlices.map((slice, idx) => {
          const csv = Papa.unparse(slice, { delimiter: ";" });
          const base = (fileName || "clientes_processados").replace(
            /\.csv$/i,
            ""
          );
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
    } catch (err) {
      setDebug((prev) => ({
        ...prev,
        sampleExtract: [
          { rowNum: "-", reason: "EXCEPTION", error: String(err?.message || err) },
        ],
      }));
      alertCsvFail();
    }
  }

  function alertCsvFail() {
    const modal = document.createElement("div");
    modal.className =
      "fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50";
    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-900 border border-purple-300/50 dark:border-purple-500/40 p-8 rounded-3xl shadow-2xl max-w-md w-full mx-4">
        <p class="text-gray-800 dark:text-white mb-6 text-lg">Não foi possível ler o arquivo.</p>
        <button class="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg" onclick="this.closest('.fixed').remove()">Entendi</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const hasDeleted = report.linhasDeletadas.length > 0;
  return (
    <section className={sectionCard}>
      {/* Modal para salvar no banco simples antes de baixar */}
      {saveModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={closeSaveModal}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-purple-300/60 dark:border-purple-500/40 rounded-3xl shadow-2xl max-w-xl w-full mx-4 p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeSaveModal}
              className="absolute right-4 top-4 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
              disabled={isSaving}
            >
              ✕
            </button>

            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Salvar informações antes de baixar a planilha
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Preencha os dados abaixo. Eles serão salvos automaticamente no banco
               e, em seguida, a planilha será baixada.
            </p>

            <form onSubmit={handleConfirmAndDownload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Nome do atendente *
                </label>
                <input
                  type="text"
                  value={saveForm.atendente}
                  onChange={(e) => handleChangeSaveField("atendente", e.target.value)}
                  className="w-full rounded-xl border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Nome do estabelecimento *
                </label>
                <input
                  type="text"
                  value={saveForm.estabelecimento}
                  onChange={(e) =>
                    handleChangeSaveField("estabelecimento", e.target.value)
                  }
                  className="w-full rounded-xl border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Portal do estabelecimento *
                </label>
                <input
                  type="text"
                  value={saveForm.portal}
                  onChange={(e) => handleChangeSaveField("portal", e.target.value)}
                  className="w-full rounded-xl border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {saveError && (
                <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
              )}

              {/* Prévia: 3 primeiras linhas da planilha corrigida */}
              <div className="mt-4 border border-purple-200 dark:border-purple-500/40 rounded-xl bg-purple-50/60 dark:bg-purple-900/20 p-3">
                <div className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">
                  Prévia da planilha corrigida (3 primeiras linhas)
                </div>
                {previewRows.length > 0 ? (
                  <div className="overflow-x-auto max-h-40">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="text-gray-700 dark:text-gray-100">
                          <th className="px-2 py-1">Nome</th>
                          <th className="px-2 py-1">Telefone</th>
                          <th className="px-2 py-1">Email</th>
                          <th className="px-2 py-1">Pontos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, idx) => (
                          <tr
                            key={idx}
                            className="border-t border-purple-100/60 dark:border-purple-700/40"
                          >
                            <td className="px-2 py-1 text-gray-800 dark:text-gray-100">
                              {r.nome}
                            </td>
                            <td className="px-2 py-1 text-gray-800 dark:text-gray-100">
                              {r.telefone}
                            </td>
                            <td className="px-2 py-1 text-gray-800 dark:text-gray-100">
                              {r.email}
                            </td>
                            <td className="px-2 py-1 text-gray-800 dark:text-gray-100">
                              {r.pontos}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-purple-900/80 dark:text-purple-100/80">
                    Importe e processe uma planilha para visualizar a prévia aqui.
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 text-white font-medium text-sm hover:from-purple-500 hover:to-violet-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
                >
                  {isSaving
                    ? "Salvando..."
                    : pendingDownloadAction === "allParts"
                    ? "Salvar e baixar todas as partes"
                    : "Salvar e baixar planilha"}
                </button>
                <button
                  type="button"
                  onClick={closeSaveModal}
                  disabled={isSaving}
                  className="px-6 py-3 rounded-xl border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-slate-800 text-sm hover:bg-white dark:hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-6 mb-10">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-500 via-violet-600 to-purple-700 shadow-lg shadow-purple-500/30 border border-purple-400/30">
          <span className="text-3xl">📋</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white">
            Tratador de CSV — Nome, Telefone, Email e Pontos (com Debug)
          </h2>
          <p className="text-gray-600 dark:text-gray-300 text-lg mt-2">
            Mapeamento automático robusto, <strong>um único telefone</strong> e exportação no
            layout oficial.
          </p>
        </div>
      </div>

      {/* Seleção + Ações rápidas */}
      <div className="rounded-2xl p-1 bg-gradient-to-r from-purple-200/40 dark:from-purple-500/20 via-violet-200/30 dark:via-violet-500/20 to-purple-200/40 dark:to-purple-500/20 mb-10">
        <div className="p-8 rounded-xl bg-white/90 dark:bg-slate-800/80 backdrop-blur-lg">
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
              📁 Seleção de Arquivo
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              Pode enviar CSV em qualquer ordem (com/sem cabeçalho). Ative o <strong>Debug</strong>{" "}
              se algo parecer estranho ou abra o <strong>Mapeamento Manual</strong> para ajustar
              colunas.
            </p>
          </div>

          <div className="flex flex-col gap-4">
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

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setDebugOpen((v) => !v)}
                className="px-4 py-2 rounded-lg border border-purple-300/50 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 bg-purple-50/70 dark:bg-purple-900/20 hover:bg-purple-100/70 dark:hover:bg-purple-900/30 transition"
              >
                {debugOpen ? "🔎 Esconder debug" : "🔎 Mostrar debug"}
              </button>

              <button
                onClick={() =>
                  openMapPanel(
                    debug.headerMap || debug.guessedMap || {
                      nome: -1,
                      telefone: -1,
                      whatsapp: -1,
                      email: -1,
                      pontos: -1,
                    },
                    debug.headerDetected,
                    "Mapeamento manual aberto pelo usuário."
                  )
                }
                disabled={!allRowsRef.current.length}
                className={`px-4 py-2 rounded-lg border transition ${
                  allRowsRef.current.length
                    ? "border-blue-300/60 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-900/20 hover:bg-blue-100/70 dark:hover:bg-blue-900/30"
                    : "border-gray-300/50 dark:border-slate-600/30 text-gray-400 dark:text-slate-400 bg-gray-100/60 dark:bg-slate-700/30 cursor-not-allowed"
                }`}
              >
                🧭 Mapeamento manual
              </button>

              {debug.lowConfidence && (
                <span className="text-amber-800 dark:text-amber-300 text-sm px-2 py-1 rounded bg-amber-100/80 dark:bg-amber-900/30 border border-amber-300/50">
                  Atenção:{" "}
                  {debug.lowConfidenceReason || "Baixa confiança na detecção automática."}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Painel de Mapeamento Manual */}
      {mapUI.open && (
        <div className="mb-10 rounded-2xl border border-blue-300/60 dark:border-blue-500/40 bg-blue-50/70 dark:bg-blue-900/20 p-6">
          <h3 className="text-lg font-bold text-blue-900 dark:text-blue-200 mb-2">
            Mapeamento manual de colunas
          </h3>
          <p className="text-xs text-blue-900/80 dark:text-blue-100/80 mb-4">
            <strong>O que é “fallback do WhatsApp”?</strong> Se o campo{" "}
            <em>Telefone</em> estiver vazio ou inválido, o sistema tenta usar o número da coluna
            mapeada como <em>WhatsApp</em>. Se o WhatsApp for válido, ele assume como telefone de
            saída; se também for inválido, a linha é deletada por ausência de número válido.
          </p>

          <div className="flex items-center gap-3 mb-4">
            <input
              id="hasHeader"
              type="checkbox"
              checked={mapUI.hasHeader}
              onChange={(e) =>
                setMapUI((p) => ({ ...p, hasHeader: e.target.checked }))
              }
            />
            <label
              htmlFor="hasHeader"
              className="text-sm text-blue-900 dark:text-blue-100"
            >
              Minha planilha possui <strong>cabeçalho na primeira linha</strong>
            </label>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: "nome", label: "Nome" },
              { key: "telefone", label: "Telefone (principal)" },
              { key: "whatsapp", label: "WhatsApp (fallback)" },
              { key: "email", label: "Email (opcional)" },
              { key: "pontos", label: "Pontos (opcional)" },
            ].map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {f.label}
                </label>
                <select
                  value={mapUI.selected[f.key]}
                  onChange={(e) =>
                    setMapUI((p) => ({
                      ...p,
                      selected: { ...p.selected, [f.key]: Number(e.target.value) },
                    }))
                  }
                  className="rounded-lg border border-blue-300/60 dark:border-blue-500/40 bg-white/90 dark:bg-slate-800/70 text-blue-900 dark:text-blue-100 px-3 py-2"
                >
                  <option value={-1}>— Não usar —</option>
                  {mapUI.options.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={applyManualMap}
              disabled={!canApplyMap(mapUI.selected)}
              className={`px-5 py-3 rounded-xl font-medium transition ${
                canApplyMap(mapUI.selected)
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500"
                  : "bg-gray-300/60 dark:bg-slate-700/50 text-gray-500 dark:text-slate-400 cursor-not-allowed"
              }`}
            >
              ✅ Aplicar mapeamento
            </button>
            <button
              onClick={() => setMapUI((p) => ({ ...p, open: false }))}
              className="px-5 py-3 rounded-xl border border-blue-300/60 dark:border-blue-500/40 text-blue-900 dark:text-blue-100 bg-white/80 dark:bg-slate-800/50 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Painel de Debug */}
      {debugOpen && (
        <div className="mb-10 rounded-2xl border border-amber-300/60 dark:border-amber-400/40 bg-amber-50/70 dark:bg-amber-900/20 p-6">
          <h3 className="text-lg font-bold text-amber-800 dark:text-amber-200 mb-4">
            Painel de Debug
          </h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-amber-900 dark:text-amber-100">
            <div className="p-3 rounded bg-white/70 dark:bg-black/20 border border-amber-200/60 dark:border-amber-500/30">
              <div>
                <strong>Delimitador escolhido:</strong>{" "}
                <code>{debug.chosenDelimiter || "(desconhecido)"}</code>
              </div>
              <div className="mt-2">
                <strong>Tentativas:</strong>
                <ul className="list-disc ml-5 mt-1">
                  {debug.triedDelims.map((t, i) => (
                    <li key={i}>
                      `{t.delimiter}` → {t.rows} linhas / {t.cols} colunas
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="p-3 rounded bg-white/70 dark:bg-black/20 border border-amber-200/60 dark:border-amber-500/30">
              <div>
                <strong>Cabeçalho detectado?</strong>{" "}
                {debug.headerDetected ? "Sim" : "Não"}
              </div>
              {debug.headerDetected && (
                <>
                  <div className="mt-2">
                    <strong>Header (linha 1):</strong>
                  </div>
                  <pre className="text-xs whitespace-pre-wrap mt-1">
                    {JSON.stringify(debug.headerRow, null, 2)}
                  </pre>
                </>
              )}
            </div>
            <div className="p-3 rounded bg-white/70 dark:bg-black/20 border border-amber-200/60 dark:border-amber-500/30">
              <div>
                <strong>Mapeamento por header/heurística:</strong>
              </div>
              <pre className="text-xs whitespace-pre-wrap mt-1">
                {JSON.stringify(debug.headerMap, null, 2)}
              </pre>
              {debug.lowConfidence && (
                <div className="mt-2 text-amber-900 dark:text-amber-200">
                  <strong>Aviso:</strong> {debug.lowConfidenceReason}
                </div>
              )}
            </div>
            <div className="p-3 rounded bg-white/70 dark:bg-black/20 border border-amber-200/60 dark:border-amber-500/30">
              <div>
                <strong>Mapeamento (heurística bruta):</strong>
              </div>
              <pre className="text-xs whitespace-pre-wrap mt-1">
                {JSON.stringify(debug.guessedMap, null, 2)}
              </pre>
            </div>
          </div>

          {debug.sampleExtract.length > 0 && (
            <div className="mt-6">
              <div className="font-semibold mb-2">
                Amostra (até 10 primeiras linhas tratadas):
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2">#</th>
                      <th className="p-2">Nome</th>
                      <th className="p-2">Telefone (raw)</th>
                      <th className="p-2">WhatsApp (raw)</th>
                      <th className="p-2">Tel dígitos</th>
                      <th className="p-2">WA dígitos</th>
                      <th className="p-2">Tel OK</th>
                      <th className="p-2">WA OK</th>
                      <th className="p-2">Telefone (saída)</th>
                      <th className="p-2">Fonte</th>
                      <th className="p-2">Email (raw)</th>
                      <th className="p-2">Email OK</th>
                      <th className="p-2">Email (saída)</th>
                      <th className="p-2">Pontos (raw)</th>
                      <th className="p-2">Pontos (saída)</th>
                      <th className="p-2">Motivo/Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debug.sampleExtract.map((r, idx) => (
                      <tr
                        key={`${r.rowNum}-${idx}`}
                        className="border-t border-amber-200/60 dark:border-amber-700/40"
                      >
                        <td className="p-2">{r.rowNum}</td>
                        <td className="p-2">{r.nome}</td>
                        <td className="p-2">{r.telefone}</td>
                        <td className="p-2">{r.whatsapp}</td>
                        <td className="p-2">{r.telDigits}</td>
                        <td className="p-2">{r.waDigits}</td>
                        <td className="p-2">
                          {r.telValid ? "✔️" : r.telValid === false ? "❌" : ""}
                        </td>
                        <td className="p-2">
                          {r.waValid ? "✔️" : r.waValid === false ? "❌" : ""}
                        </td>
                        <td className="p-2">{r.chosen}</td>
                        <td className="p-2">{r.chosenSource || ""}</td>
                        <td className="p-2">{r.email}</td>
                        <td className="p-2">
                          {r.emailValid ? "✔️" : r.emailValid === false ? "❌" : ""}
                        </td>
                        <td className="p-2">{r.emailOut}</td>
                        <td className="p-2">{r.pontosRaw}</td>
                        <td className="p-2">{r.pontosOut}</td>
                        <td className="p-2">{r.reason || r.error || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] opacity-80 mt-2">
                Dica: Email inválido e Pontos com símbolos são apagados/sanitizados sem deletar a
                linha.
              </p>
            </div>
          )}
        </div>
      )}

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
              <Stat label="Total lidas" value={report.totalLidas} />
              <Stat label="Válidas" value={report.totalValidas} positive />
            </div>

            {/* 📋 Registros Deletados */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-rose-600 dark:text-rose-400 text-lg">
                📋 Registros Deletados
              </h4>
              <button
                onClick={() => setShowDeletedSummary((v) => !v)}
                className="px-3 py-1 rounded-lg border border-rose-300/60 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 bg-rose-50/70 dark:bg-rose-900/20 hover:bg-rose-100/70 dark:hover:bg-rose-900/30 text-sm"
              >
                {showDeletedSummary ? "Esconder" : "Mostrar"}
              </button>
            </div>

            {deletedParts.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={handleDownloadDeleted}
                  className="w-full px-6 py-4 bg-gradient-to-r from-red-100/80 dark:from-red-600/30 to-rose-100/80 dark:to-rose-600/30 hover:from-red-200/80 dark:hover:from-red-600/40 hover:to-rose-200/80 dark:hover:to-rose-600/40 text-red-700 dark:text-red-200 border border-red-300/60 dark:border-red-500/40 rounded-xl font-medium transition-all duração-200 flex items-center justify-center gap-2"
                >
                  <span>📥</span>
                  Baixar registros deletados (.csv)
                </button>
              </div>
            )}

            {showDeletedSummary && (
              <>
                <div className="space-y-3 mb-4">
                  <Item
                    label="Telefone inválido"
                    value={report.deletadas.invalid_telefone}
                  />
                  <Item
                    label="WhatsApp inválido"
                    value={report.deletadas.invalid_whatsapp}
                  />
                  <Item
                    label="Telefone e WhatsApp inválidos"
                    value={report.deletadas.invalid_both}
                  />
                  <Item
                    label="Sem número válido"
                    value={report.deletadas.no_valid_number}
                  />
                  <Item
                    label="Emails inválidos (apagados do campo)"
                    value={report.deletadas.invalid_email}
                  />
                  <Item
                    label="Pontos inválidos (sanitizados)"
                    value={report.deletadas.invalid_points}
                  />
                  <Item
                    label="Usou fallback do WhatsApp (aproveitados)"
                    value={report.deletadas.used_whatsapp_fallback}
                  />
                </div>

                {hasDeleted && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                      Mostrar linhas removidas
                    </summary>
                    <div className="mt-3 p-3 bg-gray-100/70 dark:bg-slate-700/40 rounded-lg text-sm text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                      {report.linhasDeletadas.join(", ")}
                    </div>
                  </details>
                )}
              </>
            )}
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

            {outputParts.length > 0 ? (
              <>
                <button
                  onClick={() => openSaveModal("allParts")}
                  className="w-full rounded-xl px-8 py-6 font-bold text-lg transition-all duration-300 bg-gradient-to-r from-purple-600 via-violet-600 to-purple-600 text-white hover:from-purple-500 hover:via-violet-500 hover:to-purple-500 shadow-[0_8px_32px_rgba(139,92,246,0.4)] hover:shadow-[0_12px_48px_rgba(139,92,246,0.6)] transform hover:scale-[1.02]"
                  disabled={!hasResult}
                >
                  📦 Salvar dados e baixar TODAS as partes ({outputParts.length})
                </button>

                <div className="text-sm text-blue-700 dark:text-blue-300 p-4 bg-gradient-to-r from-blue-100/80 dark:from-blue-900/30 to-purple-100/80 dark:to-purple-900/30 border border-blue-300/60 dark:border-blue-600/30 rounded-xl">
                  Foram geradas{" "}
                  <span className="font-bold">{outputParts.length}</span> partes (máx. 5.000
                  registros por parte).
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {outputParts.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => triggerDownloadBlob(p.blob, p.name)}
                      className="px-3 py-2 bg-gradient-to-r from-gray-200/80 dark:from-slate-700/60 to-purple-200/80 dark:to-slate-600/60 hover:from-gray-300/80 dark:hover:from-slate-600/80 hover:to-purple-300/80 dark:hover:to-slate-500/80 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-all duration-200 border border-gray-300/50 dark:border-slate-500/30"
                    >
                      Baixar parte {idx + 1} (sem salvar)
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button
                onClick={() => openSaveModal("single")}
                disabled={!hasResult}
                className={`w-full rounded-xl px-8 py-6 font-bold text-lg transition-all duração-300 ${
                  hasResult
                    ? "bg-gradient-to-r from-purple-600 via-violet-600 to-purple-600 text-white hover:from-purple-500 hover:via-violet-500 hover:to-purple-500 shadow-[0_8px_32px_rgba(139,92,246,0.4)] hover:shadow-[0_12px_48px_rgba(139,92,246,0.6)] transform hover:scale-[1.02]"
                    : "bg-gray-300/60 dark:bg-slate-600/40 text-gray-500 dark:text-slate-400 cursor-not-allowed"
                }`}
              >
                📄 Salvar dados e baixar CSV processado
              </button>
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
                Pontos do fidelidade, Rua, Número, Complemento, Bairro, CEP, Cidade, Estado.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ======= UI helpers ======= */
function Item({ label, value }) {
  return (
    <div className="flex justify-between items-center py-3 px-4 bg-gray-100/80 dark:bg-slate-700/40 rounded-lg border border-gray-300/50 dark:border-slate-600/30">
      <span className="text-gray-700 dark:text-gray-200 font-medium">{label}</span>
      <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-500/20 px-3 py-1 rounded-full">
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value, positive }) {
  return (
    <div
      className={`text-center p-6 rounded-xl border ${
        positive
          ? "bg-gradient-to-br from-emerald-100/80 dark:from-emerald-600/20 to-green-100/80 dark:to-green-600/20 border-emerald-300/50 dark:border-emerald-500/30"
          : "bg-gradient-to-br from-purple-100/80 dark:from-purple-600/20 to-violet-100/80 dark:to-violet-600/20 border-purple-300/50 dark:border-purple-500/30"
      }`}
    >
      <div
        className={`text-3xl font-bold ${
          positive
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-purple-700 dark:text-purple-300"
        } mb-2`}
      >
        {value}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-300 font-medium">
        {label}
      </div>
    </div>
  );
}
