// src/components/Financeiro.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* =========================== HELPERS =========================== */

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function monthStartISO() {
  const d = new Date();
  d.setDate(1);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function monthEndISO() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(d.getDate() - 1);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function toDate(iso) {
  return new Date(`${iso}T00:00:00`);
}

function diffDaysInclusive(aISO, bISO) {
  const a = toDate(aISO);
  const b = toDate(bISO);
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

function formatMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseBRLMoney(text) {
  if (!text) return 0;
  const clean = String(text)
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeLocalStorageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/* =========================== DATA =========================== */

const STORAGE_KEY = "cw_financeiro_history_v1";

const periodMultipliers = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
const periodLabels = { mensal: "/mês", trimestral: "/tri", semestral: "/sem", anual: "/ano" };
const periodHuman = { mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

const planNames = { delivery: "Plano Delivery", mesas: "Plano Mesas/Comandas", premium: "Plano Premium" };

function getPeriodPrice(monthlyPrice, period) {
  const mult = periodMultipliers[period] ?? 1;
  return Number(monthlyPrice) * mult;
}

/* =========================== UI ATOMS (COMPACT) =========================== */

const cls = {
  card: "rounded-2xl p-5 border backdrop-blur-xl bg-white/80 dark:bg-black/35 border-purple-300/40 dark:border-purple-500/25 shadow-[0_6px_22px_rgba(139,92,246,0.14)]",
  iconBox:
    "w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow border border-purple-400/25",
  input:
    "w-full rounded-xl border px-3 py-2 text-sm outline-none transition-all bg-purple-50/40 dark:bg-slate-800/70 border-purple-200/70 dark:border-purple-500/20 text-gray-900 dark:text-white focus:border-[#A543FB] focus:ring-4 focus:ring-purple-200/35 dark:focus:ring-purple-900/35",
  select:
    "w-full rounded-xl border px-3 py-2 text-sm outline-none transition-all bg-purple-50/40 dark:bg-slate-800/70 border-purple-200/70 dark:border-purple-500/20 text-gray-900 dark:text-white focus:border-[#A543FB] focus:ring-4 focus:ring-purple-200/35 dark:focus:ring-purple-900/35",
};

function Pill({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-full text-xs font-extrabold transition-all border",
        active
          ? "bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white border-purple-400/30 shadow-[0_8px_20px_rgba(139,92,246,0.22)]"
          : "bg-purple-50/80 dark:bg-slate-800/60 text-gray-700 dark:text-gray-200 border-purple-200/50 dark:border-purple-500/20 hover:border-purple-400/60",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Label({ children }) {
  return <div className="text-xs font-extrabold text-gray-700 dark:text-gray-200 mb-1.5">{children}</div>;
}

function Card({ title, icon, children, rightEl }) {
  return (
    <section className={cls.card}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={cls.iconBox}>
            <span className="text-base">{icon}</span>
          </div>
          <h2 className="text-base font-black text-gray-900 dark:text-white">{title}</h2>
        </div>
        {rightEl}
      </div>
      {children}
    </section>
  );
}

function InputBase(props) {
  return <input {...props} className={[cls.input, props.className || ""].join(" ")} />;
}

function SelectBase(props) {
  return <select {...props} className={[cls.select, props.className || ""].join(" ")} />;
}

function Badge({ variant = "info", children }) {
  const clsB =
    variant === "danger"
      ? "bg-rose-500 text-white"
      : variant === "warning"
      ? "bg-amber-300 text-slate-900"
      : variant === "success"
      ? "bg-emerald-300 text-slate-900"
      : "bg-cyan-300 text-slate-900";
  return <div className={`px-2.5 py-1 rounded-full text-[11px] font-black ${clsB}`}>{children}</div>;
}

function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/50" aria-label="Fechar modal" />
      <div className="relative w-full max-w-xl rounded-2xl border border-purple-300/35 dark:border-purple-500/20 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-purple-200/60 dark:border-purple-500/20 bg-purple-50/60 dark:bg-slate-900/60">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-gray-900 dark:text-white">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-purple-200/50 dark:border-purple-500/20 hover:scale-105 active:scale-95 transition"
              title="Fechar"
            >
              ✖️
            </button>
          </div>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? <div className="px-4 py-3 border-t border-purple-200/60 dark:border-purple-500/20">{footer}</div> : null}
      </div>
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast?.open) return null;
  const icon = toast.type === "success" ? "✅" : toast.type === "error" ? "⚠️" : toast.type === "info" ? "ℹ️" : "🔔";
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[2100]">
      <div className="rounded-xl px-4 py-2.5 bg-slate-900 text-white shadow-2xl border border-white/10 flex items-center gap-3">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold">{toast.message}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-1 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition"
          title="Fechar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* =========================== MAIN COMPONENT =========================== */

export default function Financeiro() {
  const modulesData = useMemo(
    () => [
      { id: "fiscal", name: "Módulo Fiscal", monthlyPrice: 59.9 },
      { id: "estoque", name: "Módulo de Estoque Avançado", monthlyPrice: 19.9 },
      { id: "financeiro", name: "Módulo de Gestão Financeira", monthlyPrice: 49.9 },
      { id: "entregas", name: "Módulo de Gestão de Entregas", monthlyPrice: 49.9 },
      { id: "marketplaces", name: "Módulo de Integração com Marketplaces", monthlyPrice: 19.9 },
    ],
    []
  );

  const [scenario, setScenario] = useState("plan"); // plan | module

  // Dates default
  const [startDate, setStartDate] = useState(monthStartISO());
  const [endDate, setEndDate] = useState(monthEndISO());
  const [changeDate, setChangeDate] = useState(todayISO());

  const [mStartDate, setMStartDate] = useState(monthStartISO());
  const [mEndDate, setMEndDate] = useState(monthEndISO());
  const [mChangeDate, setMChangeDate] = useState(todayISO());

  // Plan scenario form
  const [currentPlan, setCurrentPlan] = useState("");
  const [currentPlanPeriod, setCurrentPlanPeriod] = useState("mensal");
  const [currentPlanValueText, setCurrentPlanValueText] = useState("");

  const [newPlan, setNewPlan] = useState("");
  const [newPlanPeriod, setNewPlanPeriod] = useState("mensal");
  const [newPlanValueText, setNewPlanValueText] = useState("");

  // Module scenario form
  const [modulePlan, setModulePlan] = useState("");
  const [modulePlanPeriod, setModulePlanPeriod] = useState("mensal");
  const [modulePlanValueText, setModulePlanValueText] = useState("");

  // Modules selections + overrides per section
  const [currentModulesSel, setCurrentModulesSel] = useState(() => new Set());
  const [newModulesSel, setNewModulesSel] = useState(() => new Set());
  const [addModulesSel, setAddModulesSel] = useState(() => new Set());

  const [currentOverrides, setCurrentOverrides] = useState({});
  const [newOverrides, setNewOverrides] = useState({});
  const [addOverrides, setAddOverrides] = useState({});

  // Collapsibles
  const [showCurrentMods, setShowCurrentMods] = useState(false);
  const [showNewMods, setShowNewMods] = useState(false);

  // Results
  const [result, setResult] = useState(null);
  const [showDailyRate, setShowDailyRate] = useState(false);

  // History
  const [history, setHistory] = useState(() => safeLocalStorageGet(STORAGE_KEY, []));
  const [confirmModal, setConfirmModal] = useState({ open: false, action: null, message: "" });
  const [detailModal, setDetailModal] = useState({ open: false, item: null });

  // Toast
  const [toast, setToast] = useState({ open: false, type: "info", message: "" });
  const toastTimer = useRef(null);

  function showToast(message, type = "info") {
    setToast({ open: true, type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, open: false })), 2600);
  }

  // Persist history
  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEY, history);
  }, [history]);

  // Keyboard shortcuts (Enter = calcular, Esc = limpar/fechar modal)
  useEffect(() => {
    function onKeyDown(e) {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      const isTyping = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";

      if (e.key === "Enter") {
        e.preventDefault();
        calculate();
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmModal.open) return setConfirmModal({ open: false, action: null, message: "" });
        if (detailModal.open) return setDetailModal({ open: false, item: null });
        if (!isTyping) clearForm();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, confirmModal.open, detailModal.open, history, result]);

  /* =========================== DERIVED =========================== */

  const daysRemainingPlan = useMemo(() => {
    if (!endDate || !changeDate) return null;
    const d = diffDaysInclusive(changeDate, endDate);
    return Math.max(0, d);
  }, [endDate, changeDate]);

  const daysRemainingModule = useMemo(() => {
    if (!mEndDate || !mChangeDate) return null;
    const d = diffDaysInclusive(mChangeDate, mEndDate);
    return Math.max(0, d);
  }, [mEndDate, mChangeDate]);

  /* =========================== MODULE HELPERS =========================== */

  function toggleSet(setter, setObj, id) {
    const next = new Set(setObj);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function modulePeriodPrice(module, period) {
    return getPeriodPrice(module.monthlyPrice, period);
  }

  function getOverrideValue(overrides, module, period) {
    const key = module.id;
    const raw = overrides[key];
    const def = modulePeriodPrice(module, period);
    const n = Number(raw);
    if (raw === "" || raw == null) return def;
    if (!Number.isFinite(n) || n < 0) return def;
    return n;
  }

  function setOverride(setOverrides, moduleId, value) {
    setOverrides((prev) => ({ ...prev, [moduleId]: value }));
  }

  /* =========================== CALC =========================== */

  function validateDatesPlan() {
    if (!startDate || !endDate || !changeDate) return "Preencha todas as datas.";
    const start = toDate(startDate);
    const end = toDate(endDate);
    const change = toDate(changeDate);

    if (change < start) return "A data de alteração não pode ser anterior ao início do período.";
    if (change > end) return "A data de alteração não pode ser posterior ao fim do período.";
    if (end < start) return "O fim do período não pode ser antes do início.";
    return null;
  }

  function validateDatesModule() {
    if (!mStartDate || !mEndDate || !mChangeDate) return "Preencha todas as datas.";
    const start = toDate(mStartDate);
    const end = toDate(mEndDate);
    const change = toDate(mChangeDate);

    if (change < start) return "A data de contratação não pode ser anterior ao início do período.";
    if (change > end) return "A data de contratação não pode ser posterior ao fim do período.";
    if (end < start) return "O fim do período não pode ser antes do início.";
    return null;
  }

  function calculate() {
    setShowDailyRate(false);

    if (scenario === "plan") {
      const err = validateDatesPlan();
      if (err) return fail(err);

      if (!currentPlan || !newPlan) return fail("Selecione o plano atual e o novo plano.");
      const currentValue = parseBRLMoney(currentPlanValueText);
      const newValue = parseBRLMoney(newPlanValueText);

      if (!(currentValue > 0) || !(newValue > 0)) return fail("Informe os valores dos planos.");

      const periodDays = diffDaysInclusive(startDate, endDate);
      const daysUsed = clamp(diffDaysInclusive(startDate, changeDate) - 1, 0, periodDays);
      const daysRemaining = clamp(diffDaysInclusive(changeDate, endDate), 0, periodDays);

      const currentModules = modulesData
        .filter((m) => currentModulesSel.has(m.id))
        .map((m) => ({ ...m, periodPrice: getOverrideValue(currentOverrides, m, currentPlanPeriod) }));

      const newModules = modulesData
        .filter((m) => newModulesSel.has(m.id))
        .map((m) => ({ ...m, periodPrice: getOverrideValue(newOverrides, m, newPlanPeriod) }));

      const creditFromOldPlan = (currentValue / periodDays) * daysRemaining;

      let creditFromOldModules = 0;
      currentModules.forEach((m) => {
        creditFromOldModules += (m.periodPrice / periodDays) * daysRemaining;
      });

      const totalCredit = creditFromOldPlan + creditFromOldModules;

      const chargeForNewPlan = (newValue / periodDays) * daysRemaining;

      let chargeForNewModules = 0;
      newModules.forEach((m) => {
        chargeForNewModules += (m.periodPrice / periodDays) * daysRemaining;
      });

      const totalCharge = chargeForNewPlan + chargeForNewModules;
      const finalAmount = totalCharge - totalCredit;

      const res = {
        type: "plan",
        date: new Date().toISOString(),
        periodDays,
        daysUsed,
        daysRemaining,
        currentPlanId: currentPlan,
        currentPlan: planNames[currentPlan] || currentPlan,
        currentPlanPeriod,
        currentPlanPeriodLabel: periodHuman[currentPlanPeriod] || currentPlanPeriod,
        currentValue,
        currentModules,
        newPlanId: newPlan,
        newPlan: planNames[newPlan] || newPlan,
        newPlanPeriod,
        newPlanPeriodLabel: periodHuman[newPlanPeriod] || newPlanPeriod,
        newValue,
        newModules,
        creditFromOldPlan,
        creditFromOldModules,
        totalCredit,
        chargeForNewPlan,
        chargeForNewModules,
        totalCharge,
        finalAmount,
      };

      setResult(res);
      saveHistory(res);
      ok();
      return;
    }

    const err = validateDatesModule();
    if (err) return fail(err);

    const periodDays = diffDaysInclusive(mStartDate, mEndDate);
    const daysRemaining = clamp(diffDaysInclusive(mChangeDate, mEndDate), 0, periodDays);

    const selectedModules = modulesData
      .filter((m) => addModulesSel.has(m.id))
      .map((m) => {
        const periodPrice = getOverrideValue(addOverrides, m, modulePlanPeriod);
        const dailyRate = periodPrice / periodDays;
        const proportionalValue = dailyRate * daysRemaining;
        return { ...m, periodPrice, dailyRate, proportionalValue };
      });

    if (!selectedModules.length) return fail("Selecione pelo menos um módulo.");

    const totalAmount = selectedModules.reduce((sum, m) => sum + m.proportionalValue, 0);

    const res = {
      type: "module",
      date: new Date().toISOString(),
      periodDays,
      daysRemaining,
      planId: modulePlan,
      plan: modulePlan ? planNames[modulePlan] : null,
      planPeriod: modulePlanPeriod,
      planPeriodLabel: periodHuman[modulePlanPeriod] || modulePlanPeriod,
      planValue: parseBRLMoney(modulePlanValueText),
      modules: selectedModules,
      totalAmount,
    };

    setResult(res);
    saveHistory(res);
    ok();
  }

  function ok() {
    showToast("Cálculo atualizado!", "success");
  }

  function fail(message) {
    setResult({ type: "error", message });
    showToast(message, "error");
  }

  function saveHistory(item) {
    setHistory((prev) => [item, ...prev].slice(0, 20));
  }

  function clearForm() {
    setScenario("plan");

    setStartDate(monthStartISO());
    setEndDate(monthEndISO());
    setChangeDate(todayISO());

    setMStartDate(monthStartISO());
    setMEndDate(monthEndISO());
    setMChangeDate(todayISO());

    setCurrentPlan("");
    setCurrentPlanPeriod("mensal");
    setCurrentPlanValueText("");

    setNewPlan("");
    setNewPlanPeriod("mensal");
    setNewPlanValueText("");

    setModulePlan("");
    setModulePlanPeriod("mensal");
    setModulePlanValueText("");

    setCurrentModulesSel(new Set());
    setNewModulesSel(new Set());
    setAddModulesSel(new Set());

    setCurrentOverrides({});
    setNewOverrides({});
    setAddOverrides({});

    setShowCurrentMods(false);
    setShowNewMods(false);

    setResult(null);
    setShowDailyRate(false);

    showToast("Formulário limpo.", "info");
  }

  /* =========================== ACTIONS =========================== */

  async function copyResult() {
    if (!result || result.type === "error") return showToast("Nenhum resultado para copiar.", "error");
    const text = generateResultText(result);
    try {
      await navigator.clipboard.writeText(text);
      showToast("Resultado copiado!", "success");
    } catch {
      showToast("Falha ao copiar.", "error");
    }
  }

  function generateResultText(r) {
    let text = "";

    if (r.type === "plan") {
      text += `📋 MUDANÇA DE PLANO\n`;
      text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      text += `📅 Período: ${r.periodDays} dias (restantes: ${r.daysRemaining})\n\n`;

      text += `❌ Plano Anterior: ${r.currentPlan}\n`;
      text += `   Valor: ${formatMoney(r.currentValue)} ${periodLabels[r.currentPlanPeriod]}\n`;
      if (r.currentModules?.length) {
        r.currentModules.forEach((m) => {
          text += `   • ${m.name}: ${formatMoney(m.periodPrice)} ${periodLabels[r.currentPlanPeriod]}\n`;
        });
      }

      text += `\n✅ Novo Plano: ${r.newPlan}\n`;
      text += `   Valor: ${formatMoney(r.newValue)} ${periodLabels[r.newPlanPeriod]}\n`;
      if (r.newModules?.length) {
        r.newModules.forEach((m) => {
          text += `   • ${m.name}: ${formatMoney(m.periodPrice)} ${periodLabels[r.newPlanPeriod]}\n`;
        });
      }

      text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
      text += `💰 Crédito plano anterior: -${formatMoney(r.creditFromOldPlan)}\n`;
      if (r.creditFromOldModules > 0) text += `💰 Crédito módulos: -${formatMoney(r.creditFromOldModules)}\n`;
      text += `💳 Cobrança novo plano: +${formatMoney(r.chargeForNewPlan)}\n`;
      if (r.chargeForNewModules > 0) text += `💳 Cobrança módulos: +${formatMoney(r.chargeForNewModules)}\n`;
      text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (r.finalAmount >= 0) text += `🔴 VALOR A COBRAR: ${formatMoney(r.finalAmount)}`;
      else text += `🟢 CRÉDITO PARA CLIENTE: ${formatMoney(Math.abs(r.finalAmount))}`;

      return text;
    }

    if (r.type === "module") {
      text += `📋 ADIÇÃO DE MÓDULOS\n`;
      text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      text += `📅 Período: ${r.periodDays} dias (restantes: ${r.daysRemaining})\n\n`;
      if (r.plan) text += `📦 Plano: ${r.plan}\n\n`;

      text += `➕ Módulos:\n`;
      r.modules.forEach((m) => {
        text += `   • ${m.name}: ${formatMoney(m.periodPrice)} ${periodLabels[r.planPeriod]} → ${formatMoney(m.proportionalValue)} (proporcional)\n`;
      });

      text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
      text += `🔴 VALOR A COBRAR: ${formatMoney(r.totalAmount)}`;
      return text;
    }

    return "";
  }

  function confirmClearHistory() {
    if (!history.length) return;
    setConfirmModal({
      open: true,
      message: "Tem certeza que deseja limpar todo o histórico?",
      action: () => setHistory([]),
    });
  }

  function confirmDeleteHistoryItem(index) {
    setConfirmModal({
      open: true,
      message: "Remover este item do histórico?",
      action: () =>
        setHistory((prev) => {
          const next = [...prev];
          next.splice(index, 1);
          return next;
        }),
    });
  }

  /* =========================== UI =========================== */

  const Header = (
    <div className="rounded-2xl overflow-hidden border border-purple-300/35 dark:border-purple-500/20 shadow-[0_6px_22px_rgba(139,92,246,0.14)]">
      <div className="bg-gradient-to-br from-[#A543FB] to-[#7e22ce] px-5 py-5 text-white relative">
        <div className="absolute -top-28 -right-28 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg md:text-xl font-black flex items-center gap-2">
              <span className="text-lg">💰</span> Financeiro • Calculadora
            </h1>
            <p className="text-white/85 text-xs mt-1.5">Cálculo proporcional de mudança de plano e adição de módulos.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={calculate}
              className="rounded-xl px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/20 font-black text-xs transition active:scale-95"
            >
              🧮 Calcular
            </button>
            <button
              type="button"
              onClick={clearForm}
              className="rounded-xl px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/15 font-black text-xs transition active:scale-95"
            >
              🧽 Limpar
            </button>
          </div>
        </div>

        <div className="relative mt-4 flex items-center gap-2 flex-wrap">
          <Pill active={scenario === "plan"} onClick={() => setScenario("plan")}>
            🔁 Mudança de Plano
          </Pill>
          <Pill active={scenario === "module"} onClick={() => setScenario("module")}>
            🧩 Adicionar Módulo
          </Pill>

          <div className="ml-auto text-[11px] text-white/85 flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-black/15 border border-white/15">⏎ Enter</span>
            <span className="px-2.5 py-1 rounded-full bg-black/15 border border-white/15">Esc</span>
          </div>
        </div>
      </div>
    </div>
  );

  function ModuleList({ period, selected, setSelected, overrides, setOverrides }) {
    return (
      <div className="space-y-2.5">
        {modulesData.map((m) => {
          const isChecked = selected.has(m.id);
          const def = modulePeriodPrice(m, period);
          const shown = getOverrideValue(overrides, m, period);

          return (
            <div
              key={m.id}
              className={[
                "rounded-2xl border p-3 transition-all",
                "bg-purple-50/50 dark:bg-slate-800/50",
                isChecked
                  ? "border-[#A543FB]/55 shadow-[0_6px_18px_rgba(165,67,251,0.14)]"
                  : "border-purple-200/60 dark:border-purple-500/20 hover:border-purple-300/80",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button type="button" onClick={() => toggleSet(setSelected, selected, m.id)} className="flex items-center gap-2">
                  <span
                    className={[
                      "w-5 h-5 rounded-lg border flex items-center justify-center",
                      isChecked ? "bg-[#A543FB] border-[#A543FB]" : "border-purple-200 dark:border-purple-500/30",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {isChecked ? <span className="text-white text-xs">✓</span> : null}
                  </span>
                  <span className="font-black text-sm text-gray-900 dark:text-white">{m.name}</span>
                </button>

                <div className="text-xs font-black text-purple-700 dark:text-purple-300">
                  {formatMoney(shown)} <span className="opacity-70">{periodLabels[period]}</span>
                </div>
              </div>

              {isChecked && (
                <div className="mt-3 pt-3 border-t border-purple-200/60 dark:border-purple-500/20">
                  <Label>Valor personalizado (opcional)</Label>
                  <InputBase
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={String(def.toFixed(2))}
                    value={overrides[m.id] ?? ""}
                    onChange={(e) => setOverride(setOverrides, m.id, e.target.value)}
                  />
                  <div className="text-[11px] text-gray-600 dark:text-gray-300 mt-1.5">
                    Padrão: <span className="font-black">{formatMoney(def)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function ResultPanel() {
    const shell =
      "rounded-2xl p-5 border border-purple-300/35 dark:border-purple-500/20 bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-[0_8px_26px_rgba(0,0,0,0.32)]";

    if (!result) {
      return (
        <div className={shell}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-black flex items-center gap-2">🧾 Resultado</div>
            <Badge variant="info">Aguardando</Badge>
          </div>
          <div className="mt-5 opacity-80 text-xs">Configure e clique em <b>Calcular</b>.</div>
        </div>
      );
    }

    if (result.type === "error") {
      return (
        <div className={shell}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-black flex items-center gap-2">🧾 Resultado</div>
            <Badge variant="danger">Erro</Badge>
          </div>
          <div className="mt-4 text-xs opacity-90">⚠️ {result.message}</div>
        </div>
      );
    }

    const actions = (
      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={copyResult}
          className="flex-1 min-w-[140px] rounded-xl px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/15 text-white font-black text-xs transition active:scale-95"
        >
          📋 Copiar
        </button>
        <button
          type="button"
          onClick={() => setShowDailyRate((v) => !v)}
          className={[
            "flex-1 min-w-[140px] rounded-xl px-4 py-2.5 border font-black text-xs transition active:scale-95",
            showDailyRate ? "bg-cyan-300 text-slate-900 border-cyan-200" : "bg-white/10 hover:bg-white/20 border-white/15 text-white",
          ].join(" ")}
        >
          📈 Taxa diária
        </button>
      </div>
    );

    if (result.type === "plan") {
      const badge = result.finalAmount >= 0 ? <Badge variant="warning">A Cobrar</Badge> : <Badge variant="success">Crédito</Badge>;
      const amountLabel = result.finalAmount >= 0 ? "Valor a Cobrar" : "Crédito p/ Cliente";
      const amountValue = formatMoney(Math.abs(result.finalAmount));

      return (
        <div className={shell}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-black flex items-center gap-2">🧾 Resultado</div>
            {badge}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              ["Período", `${result.periodDays}d`],
              ["Usados", `${result.daysUsed}d`],
              ["Restantes", `${result.daysRemaining}d`],
            ].map(([a, b]) => (
              <div key={a} className="rounded-xl bg-white/8 border border-white/10 p-3 text-center">
                <div className="text-[11px] opacity-70">{a}</div>
                <div className="text-sm font-black">{b}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2 bg-white/10 text-xs font-black">Plano atual</div>
              <div className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold">{periodHuman[result.currentPlanPeriod]} • {result.currentPlan}</div>
                  <div className="text-xs font-black">
                    {formatMoney(result.currentValue)} <span className="opacity-70">{periodLabels[result.currentPlanPeriod]}</span>
                  </div>
                </div>
                {result.currentModules?.length ? (
                  <div className="pt-2 mt-2 border-t border-white/10 space-y-1.5">
                    {result.currentModules.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs opacity-90">
                        <div>• {m.name}</div>
                        <div className="font-bold">
                          {formatMoney(m.periodPrice)} <span className="opacity-70">{periodLabels[result.currentPlanPeriod]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="text-center opacity-60 text-xs">⬇️</div>

            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2 bg-white/10 text-xs font-black">Novo plano</div>
              <div className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold">{periodHuman[result.newPlanPeriod]} • {result.newPlan}</div>
                  <div className="text-xs font-black">
                    {formatMoney(result.newValue)} <span className="opacity-70">{periodLabels[result.newPlanPeriod]}</span>
                  </div>
                </div>
                {result.newModules?.length ? (
                  <div className="pt-2 mt-2 border-t border-white/10 space-y-1.5">
                    {result.newModules.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs opacity-90">
                        <div>• {m.name}</div>
                        <div className="font-bold">
                          {formatMoney(m.periodPrice)} <span className="opacity-70">{periodLabels[result.newPlanPeriod]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl p-4 bg-white/8 border border-white/10">
            <Row label={`Crédito plano anterior (${result.daysRemaining} dias)`} value={`- ${formatMoney(result.creditFromOldPlan)}`} color="text-emerald-300" />
            {result.creditFromOldModules > 0 ? (
              <Row label="Crédito módulos" value={`- ${formatMoney(result.creditFromOldModules)}`} color="text-emerald-300" />
            ) : null}
            <Row label={`Cobrança novo plano (${result.daysRemaining} dias)`} value={`+ ${formatMoney(result.chargeForNewPlan)}`} color="text-amber-300" />
            {result.chargeForNewModules > 0 ? (
              <Row label="Cobrança módulos" value={`+ ${formatMoney(result.chargeForNewModules)}`} color="text-amber-300" />
            ) : null}

            <div className="mt-3 pt-3 border-t border-white/15 flex items-end justify-between">
              <div className="text-xs font-black">{amountLabel}</div>
              <div className="text-lg font-black text-cyan-200">{amountValue}</div>
            </div>
          </div>

          {actions}

          {showDailyRate ? (
            <div className="mt-4 rounded-2xl p-4 bg-cyan-300/10 border border-cyan-200/25">
              <div className="text-[11px] font-black text-cyan-200 uppercase tracking-wide mb-2">Taxa diária</div>

              <Row
                label="Plano anterior"
                value={`${formatMoney(result.currentValue / result.periodDays)}/dia`}
                color="text-cyan-200"
              />
              <Row label="Novo plano" value={`${formatMoney(result.newValue / result.periodDays)}/dia`} color="text-cyan-200" />

              {result.currentModules?.length
                ? result.currentModules.map((m) => (
                    <Row
                      key={m.id}
                      label={`${m.name} (atual)`}
                      value={`${formatMoney(m.periodPrice / result.periodDays)}/dia`}
                      color="text-cyan-200"
                    />
                  ))
                : null}

              {result.newModules?.length
                ? result.newModules.map((m) => (
                    <Row
                      key={m.id}
                      label={`${m.name} (novo)`}
                      value={`${formatMoney(m.periodPrice / result.periodDays)}/dia`}
                      color="text-cyan-200"
                    />
                  ))
                : null}
            </div>
          ) : null}
        </div>
      );
    }

    // module result
    return (
      <div className={shell}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-black flex items-center gap-2">🧾 Resultado</div>
          <Badge variant="warning">A Cobrar</Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/8 border border-white/10 p-3 text-center">
            <div className="text-[11px] opacity-70">Período</div>
            <div className="text-sm font-black">{result.periodDays} dias</div>
          </div>
          <div className="rounded-xl bg-white/8 border border-white/10 p-3 text-center">
            <div className="text-[11px] opacity-70">Restantes</div>
            <div className="text-sm font-black">{result.daysRemaining} dias</div>
          </div>
        </div>

        {result.plan ? (
          <div className="mt-4 rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-2 bg-white/10 text-xs font-black">Plano</div>
            <div className="px-4 py-3 flex items-center justify-between gap-2">
              <div className="text-xs font-bold">{periodHuman[result.planPeriod]} • {result.plan}</div>
              <div className="text-xs font-black">
                {formatMoney(result.planValue)} <span className="opacity-70">{periodLabels[result.planPeriod]}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-white/10 overflow-hidden">
          <div className="px-4 py-2 bg-white/10 text-xs font-black">Módulos</div>
          <div className="px-4 py-3 space-y-1.5">
            {result.modules.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-xs">
                <div className="opacity-90">• {m.name}</div>
                <div className="font-black">
                  {formatMoney(m.periodPrice)} <span className="opacity-70">{periodLabels[result.planPeriod]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-2xl p-4 bg-white/8 border border-white/10">
          {result.modules.map((m) => (
            <Row key={m.id} label={`${m.name} (${result.daysRemaining} dias)`} value={`+ ${formatMoney(m.proportionalValue)}`} color="text-amber-300" />
          ))}
          <div className="mt-3 pt-3 border-t border-white/15 flex items-end justify-between">
            <div className="text-xs font-black">Valor a Cobrar</div>
            <div className="text-lg font-black text-cyan-200">{formatMoney(result.totalAmount)}</div>
          </div>
        </div>

        {actions}

        {showDailyRate ? (
          <div className="mt-4 rounded-2xl p-4 bg-cyan-300/10 border border-cyan-200/25">
            <div className="text-[11px] font-black text-cyan-200 uppercase tracking-wide mb-2">Taxa diária</div>
            {result.modules.map((m) => (
              <Row key={m.id} label={m.name} value={`${formatMoney(m.dailyRate)}/dia`} color="text-cyan-200" />
            ))}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl p-3 bg-cyan-300/10 border border-cyan-200/25 text-xs">
          💡 Na próxima renovação, será cobrado o valor integral do período.
        </div>
      </div>
    );
  }

  function Row({ label, value, color = "text-white" }) {
    return (
      <div className="flex items-center justify-between text-xs py-2 border-b border-white/10 last:border-b-0">
        <div className="opacity-80">{label}</div>
        <div className={`font-black ${color}`}>{value}</div>
      </div>
    );
  }

  function HistoryPanel() {
    return (
      <Card
        title="Histórico"
        icon="🕘"
        rightEl={
          <button
            type="button"
            onClick={confirmClearHistory}
            className="rounded-xl px-3 py-2 bg-rose-500 text-white font-black text-xs hover:bg-rose-600 transition active:scale-95"
            title="Limpar histórico"
          >
            🗑️ Limpar
          </button>
        }
      >
        {!history.length ? (
          <div className="rounded-2xl p-6 border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/50 dark:bg-slate-800/40 text-center">
            <div className="text-2xl mb-1">📥</div>
            <div className="font-black text-sm text-gray-800 dark:text-gray-200">Nenhum cálculo salvo</div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {history.map((item, idx) => {
              const dt = new Date(item.date);
              const dateStr =
                dt.toLocaleDateString("pt-BR") +
                " " +
                dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

              let details = "";
              let total = 0;

              if (item.type === "plan") {
                details = `${item.currentPlan} → ${item.newPlan}`;
                total = item.finalAmount;
              } else {
                details = item.modules.map((m) => m.name).join(", ");
                total = item.totalAmount;
              }

              const sign = total >= 0 ? "+" : "-";
              const color = total >= 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300";

              return (
                <div
                  key={idx}
                  className="rounded-2xl p-4 border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/50 dark:bg-slate-800/40"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-[220px]">
                      <div className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <span>{item.type === "plan" ? "🔁" : "🧩"}</span>
                        <span>{dateStr}</span>
                      </div>
                      <div className="text-xs text-gray-700 dark:text-gray-300 mt-1 line-clamp-2">{details}</div>
                      <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">
                        {item.daysRemaining} dias restantes de {item.periodDays}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className={`font-black text-sm ${color}`}>
                        {sign} {formatMoney(Math.abs(total))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setDetailModal({ open: true, item })}
                        className="rounded-xl px-3 py-2 bg-[#A543FB] text-white font-black text-[11px] hover:brightness-110 transition active:scale-95"
                        title="Ver detalhes"
                      >
                        👁️ Ver
                      </button>

                      <button
                        type="button"
                        onClick={() => confirmDeleteHistoryItem(idx)}
                        className="rounded-xl px-3 py-2 bg-white/70 dark:bg-slate-900/40 border border-purple-200/60 dark:border-purple-500/20 text-rose-600 font-black text-[11px] hover:bg-rose-50 dark:hover:bg-slate-900/60 transition active:scale-95"
                        title="Remover"
                      >
                        ✖️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  }

  function DetailContent({ item }) {
    if (!item) return null;

    const dt = new Date(item.date);
    const dateStr =
      dt.toLocaleDateString("pt-BR") +
      " às " +
      dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    if (item.type === "plan") {
      const label = item.finalAmount >= 0 ? "Valor a Cobrar" : "Crédito para o Cliente";
      return (
        <div className="space-y-3 text-sm">
          <div className="text-xs text-gray-600 dark:text-gray-300">📅 {dateStr}</div>

          <div className="grid grid-cols-3 gap-2">
            {[
              ["Período", `${item.periodDays}d`],
              ["Usados", `${item.daysUsed}d`],
              ["Restantes", `${item.daysRemaining}d`],
            ].map(([a, b]) => (
              <div key={a} className="rounded-xl border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/40 p-3 text-center">
                <div className="text-[11px] opacity-70">{a}</div>
                <div className="font-black text-sm">{b}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 overflow-hidden">
            <div className="px-4 py-2 bg-purple-50 dark:bg-slate-800/60 text-xs font-black">Plano atual</div>
            <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-bold">{periodHuman[item.currentPlanPeriod]} • {item.currentPlan}</div>
              <div className="text-xs font-black">
                {formatMoney(item.currentValue)} <span className="opacity-70">{periodLabels[item.currentPlanPeriod]}</span>
              </div>
            </div>
            {item.currentModules?.length ? (
              <div className="px-4 pb-4 space-y-1.5">
                {item.currentModules.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-200">
                    <div>• {m.name}</div>
                    <div className="font-bold">
                      {formatMoney(m.periodPrice)} <span className="opacity-70">{periodLabels[item.currentPlanPeriod]}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="text-center opacity-60 text-xs">⬇️</div>

          <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 overflow-hidden">
            <div className="px-4 py-2 bg-purple-50 dark:bg-slate-800/60 text-xs font-black">Novo plano</div>
            <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-bold">{periodHuman[item.newPlanPeriod]} • {item.newPlan}</div>
              <div className="text-xs font-black">
                {formatMoney(item.newValue)} <span className="opacity-70">{periodLabels[item.newPlanPeriod]}</span>
              </div>
            </div>
            {item.newModules?.length ? (
              <div className="px-4 pb-4 space-y-1.5">
                {item.newModules.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-200">
                    <div>• {m.name}</div>
                    <div className="font-bold">
                      {formatMoney(m.periodPrice)} <span className="opacity-70">{periodLabels[item.newPlanPeriod]}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl p-4 bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white">
            <div className="flex items-center justify-between text-xs py-2 border-b border-white/15">
              <div className="opacity-90">Crédito plano</div>
              <div className="font-black">- {formatMoney(item.creditFromOldPlan)}</div>
            </div>
            {item.creditFromOldModules > 0 ? (
              <div className="flex items-center justify-between text-xs py-2 border-b border-white/15">
                <div className="opacity-90">Crédito módulos</div>
                <div className="font-black">- {formatMoney(item.creditFromOldModules)}</div>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-xs py-2 border-b border-white/15">
              <div className="opacity-90">Cobrança plano</div>
              <div className="font-black">+ {formatMoney(item.chargeForNewPlan)}</div>
            </div>
            {item.chargeForNewModules > 0 ? (
              <div className="flex items-center justify-between text-xs py-2 border-b border-white/15">
                <div className="opacity-90">Cobrança módulos</div>
                <div className="font-black">+ {formatMoney(item.chargeForNewModules)}</div>
              </div>
            ) : null}
            <div className="mt-3 pt-3 border-t border-white/20 flex items-end justify-between">
              <div className="text-xs font-black">{label}</div>
              <div className="text-lg font-black">{formatMoney(Math.abs(item.finalAmount))}</div>
            </div>
          </div>
        </div>
      );
    }

    // module
    return (
      <div className="space-y-3">
        <div className="text-xs text-gray-600 dark:text-gray-300">📅 {dateStr}</div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/40 p-3 text-center">
            <div className="text-[11px] opacity-70">Período</div>
            <div className="font-black text-sm">{item.periodDays} dias</div>
          </div>
          <div className="rounded-xl border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/40 p-3 text-center">
            <div className="text-[11px] opacity-70">Restantes</div>
            <div className="font-black text-sm">{item.daysRemaining} dias</div>
          </div>
        </div>

        {item.plan ? (
          <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 overflow-hidden">
            <div className="px-4 py-2 bg-purple-50 dark:bg-slate-800/60 text-xs font-black">Plano</div>
            <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-bold">{periodHuman[item.planPeriod]} • {item.plan}</div>
              <div className="text-xs font-black">
                {formatMoney(item.planValue)} <span className="opacity-70">{periodLabels[item.planPeriod]}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 overflow-hidden">
          <div className="px-4 py-2 bg-purple-50 dark:bg-slate-800/60 text-xs font-black">Módulos</div>
          <div className="px-4 py-3 space-y-1.5">
            {item.modules.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-200">
                <div>• {m.name}</div>
                <div className="font-black">{formatMoney(m.proportionalValue)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white">
          <div className="flex items-end justify-between">
            <div className="text-xs font-black">Valor a Cobrar</div>
            <div className="text-lg font-black">{formatMoney(item.totalAmount)}</div>
          </div>
        </div>
      </div>
    );
  }

  /* =========================== FORMS =========================== */

  const PlanForm = (
    <Card title="Cenário: Mudança de Plano" icon="🔁">
      <div className="rounded-2xl p-4 border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/30 text-xs text-gray-700 dark:text-gray-200">
        ℹ️ O valor não utilizado do plano antigo vira <b>crédito</b>. O plano novo é cobrado proporcional aos dias restantes.
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="font-black text-sm text-gray-900 dark:text-white">Plano Atual</div>
            <div className="text-[11px] font-black text-purple-700 dark:text-purple-300">⬇️</div>
          </div>

          <Label>Plano</Label>
          <SelectBase value={currentPlan} onChange={(e) => setCurrentPlan(e.target.value)}>
            <option value="">Selecione</option>
            <option value="delivery">Plano Delivery</option>
            <option value="mesas">Plano Mesas/Comandas</option>
            <option value="premium">Plano Premium</option>
          </SelectBase>

          <div className="mt-3">
            <Label>Período</Label>
            <SelectBase value={currentPlanPeriod} onChange={(e) => setCurrentPlanPeriod(e.target.value)}>
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </SelectBase>
          </div>

          <div className="mt-3">
            <Label>Valor do Plano (R$)</Label>
            <InputBase
              inputMode="decimal"
              placeholder="Ex.: 199,90"
              value={currentPlanValueText}
              onChange={(e) => setCurrentPlanValueText(e.target.value)}
            />
            <div className="text-[11px] text-gray-600 dark:text-gray-300 mt-1.5">
              Dica: pode digitar <b>199,90</b> ou <b>R$ 199,90</b>.
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <InputBase type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <InputBase type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <Label>Alteração</Label>
              <InputBase type="date" value={changeDate} onChange={(e) => setChangeDate(e.target.value)} />
            </div>
            <div>
              <Label>Dias restantes</Label>
              <div className="rounded-xl border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/50 px-3 py-2 text-center">
                <div className="text-xl font-black text-purple-700 dark:text-purple-300">
                  {daysRemainingPlan == null ? "--" : daysRemainingPlan}
                </div>
                <div className="text-[11px] text-gray-600 dark:text-gray-300">dias</div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowCurrentMods((v) => !v)}
              className="flex items-center gap-2 text-xs font-black text-gray-800 dark:text-gray-200 hover:text-purple-700 dark:hover:text-purple-300 transition"
            >
              <span className={`transition ${showCurrentMods ? "rotate-90" : ""}`}>▶</span>
              Módulos atuais <span className="text-[11px] font-bold opacity-70">(opcional)</span>
            </button>

            {showCurrentMods ? (
              <div className="mt-3">
                <ModuleList
                  period={currentPlanPeriod}
                  selected={currentModulesSel}
                  setSelected={setCurrentModulesSel}
                  overrides={currentOverrides}
                  setOverrides={setCurrentOverrides}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="font-black text-sm text-gray-900 dark:text-white">Novo Plano</div>
            <div className="text-[11px] font-black text-purple-700 dark:text-purple-300">⬆️</div>
          </div>

          <Label>Plano</Label>
          <SelectBase value={newPlan} onChange={(e) => setNewPlan(e.target.value)}>
            <option value="">Selecione</option>
            <option value="delivery">Plano Delivery</option>
            <option value="mesas">Plano Mesas/Comandas</option>
            <option value="premium">Plano Premium</option>
          </SelectBase>

          <div className="mt-3">
            <Label>Período</Label>
            <SelectBase value={newPlanPeriod} onChange={(e) => setNewPlanPeriod(e.target.value)}>
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </SelectBase>
          </div>

          <div className="mt-3">
            <Label>Valor do Novo Plano (R$)</Label>
            <InputBase
              inputMode="decimal"
              placeholder="Ex.: 249,90"
              value={newPlanValueText}
              onChange={(e) => setNewPlanValueText(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowNewMods((v) => !v)}
              className="flex items-center gap-2 text-xs font-black text-gray-800 dark:text-gray-200 hover:text-purple-700 dark:hover:text-purple-300 transition"
            >
              <span className={`transition ${showNewMods ? "rotate-90" : ""}`}>▶</span>
              Novos módulos <span className="text-[11px] font-bold opacity-70">(opcional)</span>
            </button>

            {showNewMods ? (
              <div className="mt-3">
                <ModuleList
                  period={newPlanPeriod}
                  selected={newModulesSel}
                  setSelected={setNewModulesSel}
                  overrides={newOverrides}
                  setOverrides={setNewOverrides}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={calculate}
          className="rounded-xl px-5 py-3 bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white font-black shadow-[0_8px_22px_rgba(139,92,246,0.22)] hover:brightness-110 transition active:scale-95 text-sm"
        >
          🧮 Calcular
        </button>
        <button
          type="button"
          onClick={clearForm}
          className="rounded-xl px-5 py-3 bg-white/70 dark:bg-slate-800/70 border border-purple-200/60 dark:border-purple-500/20 text-gray-800 dark:text-gray-100 font-black hover:bg-purple-50 dark:hover:bg-slate-800 transition active:scale-95 text-sm"
        >
          🧽 Limpar
        </button>
      </div>
    </Card>
  );

  const ModuleForm = (
    <Card title="Cenário: Adicionar Módulo" icon="🧩">
      <div className="rounded-2xl p-4 border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/30 text-xs text-gray-700 dark:text-gray-200">
        ℹ️ O módulo é cobrado apenas pelos dias entre a contratação e o fim do período atual.
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <Label>Plano contratado (opcional)</Label>
          <SelectBase value={modulePlan} onChange={(e) => setModulePlan(e.target.value)}>
            <option value="">Selecione</option>
            <option value="delivery">Plano Delivery</option>
            <option value="mesas">Plano Mesas/Comandas</option>
            <option value="premium">Plano Premium</option>
          </SelectBase>

          <div className="mt-3">
            <Label>Período</Label>
            <SelectBase value={modulePlanPeriod} onChange={(e) => setModulePlanPeriod(e.target.value)}>
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </SelectBase>
          </div>

          <div className="mt-3">
            <Label>Valor do Plano (R$) (opcional)</Label>
            <InputBase
              inputMode="decimal"
              placeholder="Ex.: 199,90"
              value={modulePlanValueText}
              onChange={(e) => setModulePlanValueText(e.target.value)}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <InputBase type="date" value={mStartDate} onChange={(e) => setMStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <InputBase type="date" value={mEndDate} onChange={(e) => setMEndDate(e.target.value)} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <Label>Contratação</Label>
              <InputBase type="date" value={mChangeDate} onChange={(e) => setMChangeDate(e.target.value)} />
            </div>
            <div>
              <Label>Dias restantes</Label>
              <div className="rounded-xl border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/50 px-3 py-2 text-center">
                <div className="text-xl font-black text-purple-700 dark:text-purple-300">
                  {daysRemainingModule == null ? "--" : daysRemainingModule}
                </div>
                <div className="text-[11px] text-gray-600 dark:text-gray-300">dias</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="font-black text-sm text-gray-900 dark:text-white mb-2">Módulos a adicionar</div>
          <ModuleList
            period={modulePlanPeriod}
            selected={addModulesSel}
            setSelected={setAddModulesSel}
            overrides={addOverrides}
            setOverrides={setAddOverrides}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={calculate}
          className="rounded-xl px-5 py-3 bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white font-black shadow-[0_8px_22px_rgba(139,92,246,0.22)] hover:brightness-110 transition active:scale-95 text-sm"
        >
          🧮 Calcular
        </button>
        <button
          type="button"
          onClick={clearForm}
          className="rounded-xl px-5 py-3 bg-white/70 dark:bg-slate-800/70 border border-purple-200/60 dark:border-purple-500/20 text-gray-800 dark:text-gray-100 font-black hover:bg-purple-50 dark:hover:bg-slate-800 transition active:scale-95 text-sm"
        >
          🧽 Limpar
        </button>
      </div>
    </Card>
  );

  return (
    <div className="text-[0.95rem]">
      <Toast toast={toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />

      {Header}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-7">
        <div className="space-y-6">{scenario === "plan" ? PlanForm : ModuleForm}</div>
        <div className="space-y-6">
          <ResultPanel />
          <HistoryPanel />
        </div>
      </div>

      <Modal
        open={confirmModal.open}
        title="Confirmar ação"
        onClose={() => setConfirmModal({ open: false, action: null, message: "" })}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmModal({ open: false, action: null, message: "" })}
              className="flex-1 rounded-xl px-4 py-2.5 bg-white/70 dark:bg-slate-800/70 border border-purple-200/60 dark:border-purple-500/20 font-black text-gray-800 dark:text-gray-100 hover:bg-purple-50 dark:hover:bg-slate-800 transition active:scale-95 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                confirmModal.action?.();
                setConfirmModal({ open: false, action: null, message: "" });
                showToast("Ação concluída.", "success");
              }}
              className="flex-1 rounded-xl px-4 py-2.5 bg-rose-500 text-white font-black hover:bg-rose-600 transition active:scale-95 text-sm"
            >
              Confirmar
            </button>
          </div>
        }
      >
        <div className="text-sm text-gray-700 dark:text-gray-200">{confirmModal.message}</div>
      </Modal>

      <Modal
        open={detailModal.open}
        title="Detalhes do cálculo"
        onClose={() => setDetailModal({ open: false, item: null })}
        footer={
          <button
            type="button"
            onClick={() => setDetailModal({ open: false, item: null })}
            className="w-full rounded-xl px-5 py-3 bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white font-black hover:brightness-110 transition active:scale-95 text-sm"
          >
            Fechar
          </button>
        }
      >
        <DetailContent item={detailModal.item} />
      </Modal>
    </div>
  );
}
