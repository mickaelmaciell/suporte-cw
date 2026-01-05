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

const periodMultipliers = {
  mensal: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

const periodLabels = {
  mensal: "/mês",
  trimestral: "/tri",
  semestral: "/sem",
  anual: "/ano",
};

const periodHuman = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const planNames = {
  delivery: "Plano Delivery",
  mesas: "Plano Mesas/Comandas",
  premium: "Plano Premium",
};

function getPeriodPrice(monthlyPrice, period) {
  const mult = periodMultipliers[period] ?? 1;
  return Number(monthlyPrice) * mult;
}

/* =========================== UI ATOMS (COMPACT) =========================== */

function Pill({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
        active
          ? "bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white border-purple-400/30 shadow-[0_10px_25px_rgba(139,92,246,0.18)]"
          : "bg-purple-50/80 dark:bg-slate-800/60 text-gray-700 dark:text-gray-200 border-purple-200/50 dark:border-purple-500/20 hover:border-purple-400/60",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Label({ children }) {
  return <div className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-2">{children}</div>;
}

function Card({ title, icon, children, rightEl }) {
  return (
    <section className="rounded-2xl p-6 border backdrop-blur-xl bg-white/80 dark:bg-black/35 border-purple-300/50 dark:border-purple-500/25 shadow-[0_8px_26px_rgba(139,92,246,0.14)]">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow border border-purple-400/30">
            <span className="text-lg">{icon}</span>
          </div>
          <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">{title}</h2>
        </div>
        {rightEl}
      </div>
      {children}
    </section>
  );
}

function InputBase(props) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-2xl border-2 px-3 py-2 text-sm outline-none transition-all",
        "bg-purple-50/40 dark:bg-slate-800/70",
        "border-purple-200/70 dark:border-purple-500/20",
        "text-gray-900 dark:text-white",
        "focus:border-[#A543FB] focus:ring-4 focus:ring-purple-200/30 dark:focus:ring-purple-900/35",
        props.className || "",
      ].join(" ")}
    />
  );
}

function SelectBase(props) {
  return (
    <select
      {...props}
      className={[
        "w-full rounded-2xl border-2 px-3 py-2 text-sm outline-none transition-all",
        "bg-purple-50/40 dark:bg-slate-800/70",
        "border-purple-200/70 dark:border-purple-500/20",
        "text-gray-900 dark:text-white",
        "focus:border-[#A543FB] focus:ring-4 focus:ring-purple-200/30 dark:focus:ring-purple-900/35",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Badge({ variant = "info", children }) {
  const cls =
    variant === "danger"
      ? "bg-rose-500 text-white"
      : variant === "warning"
      ? "bg-amber-400 text-slate-900"
      : variant === "success"
      ? "bg-emerald-400 text-slate-900"
      : "bg-cyan-400 text-slate-900";

  return <div className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${cls}`}>{children}</div>;
}

function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/50" aria-label="Fechar modal" />
      <div className="relative w-full max-w-2xl rounded-2xl border border-purple-300/40 dark:border-purple-500/20 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-purple-200/60 dark:border-purple-500/20 bg-purple-50/60 dark:bg-slate-900/60">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-extrabold text-gray-900 dark:text-white">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-purple-200/50 dark:border-purple-500/20 hover:scale-105 active:scale-95 transition"
              title="Fechar"
            >
              ✖️
            </button>
          </div>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer ? <div className="px-5 py-4 border-t border-purple-200/60 dark:border-purple-500/20">{footer}</div> : null}
      </div>
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast?.open) return null;

  const icon = toast.type === "success" ? "✅" : toast.type === "error" ? "⚠️" : toast.type === "info" ? "ℹ️" : "🔔";

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[2100]">
      <div className="rounded-2xl px-4 py-2.5 bg-slate-900 text-white shadow-2xl border border-white/10 flex items-center gap-3">
        <span className="text-base">{icon}</span>
        <span className="text-sm font-medium">{toast.message}</span>
        <button type="button" onClick={onClose} className="ml-2 w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 transition" title="Fechar">
          ✕
        </button>
      </div>
    </div>
  );
}

/* =========================== MAIN COMPONENT =========================== */

export default function Financeiro() {
  // ✅ VALORES ATUALIZADOS (por mês) conforme seu print
  const modulesData = useMemo(
    () => [
      { id: "estoque", name: "Módulo de Estoque Avançado", monthlyPrice: 29.99 },
      { id: "fiscal", name: "Módulo Fiscal", monthlyPrice: 69.99 },
      { id: "financeiro", name: "Módulo de Gestão Financeira", monthlyPrice: 69.99 },
      { id: "entregas", name: "Módulo de Gestão de Entregas", monthlyPrice: 54.99 },
      { id: "marketplaces", name: "Módulo de Integração com Marketplaces", monthlyPrice: 29.99 },
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

  // Keyboard shortcuts
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
        .map((m) => ({
          ...m,
          periodPrice: getOverrideValue(currentOverrides, m, currentPlanPeriod),
        }));

      const newModules = modulesData
        .filter((m) => newModulesSel.has(m.id))
        .map((m) => ({
          ...m,
          periodPrice: getOverrideValue(newOverrides, m, newPlanPeriod),
        }));

      const dailyRateCurrent = currentValue / periodDays;
      const creditFromOldPlan = dailyRateCurrent * daysRemaining;

      let creditFromOldModules = 0;
      currentModules.forEach((m) => {
        const daily = m.periodPrice / periodDays;
        creditFromOldModules += daily * daysRemaining;
      });

      const totalCredit = creditFromOldPlan + creditFromOldModules;

      const dailyRateNew = newValue / periodDays;
      const chargeForNewPlan = dailyRateNew * daysRemaining;

      let chargeForNewModules = 0;
      newModules.forEach((m) => {
        const daily = m.periodPrice / periodDays;
        chargeForNewModules += daily * daysRemaining;
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

  /* =========================== UI RENDER =========================== */

  const Header = (
    <div className="rounded-2xl overflow-hidden border border-purple-300/40 dark:border-purple-500/20 shadow-[0_8px_26px_rgba(139,92,246,0.14)]">
      <div className="bg-gradient-to-br from-[#A543FB] to-[#7e22ce] px-6 py-6 text-white relative">
        <div className="absolute -top-28 -right-28 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="relative flex items-start justify-between gap-5 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-3">
              <span className="text-xl">💰</span> Financeiro • Calculadora
            </h1>
            <p className="text-white/85 text-xs mt-2">Cálculo proporcional de mudança de plano e adição de módulos.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={calculate}
              className="rounded-2xl px-4 py-2.5 bg-white/15 hover:bg-white/25 border border-white/20 font-bold text-xs transition active:scale-95"
            >
              🧮 Calcular
            </button>
            <button
              type="button"
              onClick={clearForm}
              className="rounded-2xl px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/15 font-bold text-xs transition active:scale-95"
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
          <div className="ml-auto text-[11px] text-white/80 flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-black/15 border border-white/15">⏎ Enter = Calcular</span>
            <span className="px-2.5 py-1 rounded-full bg-black/15 border border-white/15">Esc = Limpar/Fechar</span>
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
                "rounded-2xl border-2 p-3 transition-all",
                "bg-purple-50/50 dark:bg-slate-800/45",
                isChecked
                  ? "border-[#A543FB]/60 shadow-[0_8px_20px_rgba(165,67,251,0.12)]"
                  : "border-purple-200/60 dark:border-purple-500/20 hover:border-purple-300/80",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button type="button" onClick={() => toggleSet(setSelected, selected, m.id)} className="flex items-center gap-3">
                  <span
                    className={[
                      "w-5 h-5 rounded-lg border-2 flex items-center justify-center",
                      isChecked ? "bg-[#A543FB] border-[#A543FB]" : "border-purple-200 dark:border-purple-500/30",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {isChecked ? <span className="text-white text-xs">✓</span> : null}
                  </span>
                  <span className="font-extrabold text-gray-900 dark:text-white text-sm">{m.name}</span>
                </button>

                <div className="text-sm font-extrabold text-purple-700 dark:text-purple-300">
                  {formatMoney(shown)}
                  <span className="opacity-70 font-bold"> {periodLabels[period]}</span>
                </div>
              </div>

              {isChecked && (
                <div className="mt-3 pt-3 border-t border-purple-200/60 dark:border-purple-500/20">
                  <Label>Valor do período personalizado (opcional)</Label>
                  <InputBase
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={String(def.toFixed(2))}
                    value={overrides[m.id] ?? ""}
                    onChange={(e) => setOverride(setOverrides, m.id, e.target.value)}
                  />
                  <div className="text-[11px] text-gray-600 dark:text-gray-300 mt-2">
                    Padrão do período: <span className="font-bold">{formatMoney(def)}</span>
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
    if (!result) {
      return (
        <div className="rounded-2xl p-6 border border-purple-300/35 dark:border-purple-500/20 bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-[0_10px_30px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between">
            <div className="text-base font-extrabold flex items-center gap-2">🧾 Resultado</div>
            <Badge variant="info">Aguardando</Badge>
          </div>
          <div className="mt-6 opacity-80 text-sm">Configure e clique em <b>Calcular</b>.</div>
        </div>
      );
    }

    if (result.type === "error") {
      return (
        <div className="rounded-2xl p-6 border border-purple-300/35 dark:border-purple-500/20 bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-[0_10px_30px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between">
            <div className="text-base font-extrabold flex items-center gap-2">🧾 Resultado</div>
            <Badge variant="danger">Erro</Badge>
          </div>
          <div className="mt-4 text-sm opacity-90">⚠️ {result.message}</div>
        </div>
      );
    }

    const actions = (
      <div className="mt-5 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={copyResult}
          className="flex-1 min-w-[150px] rounded-2xl px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-xs transition active:scale-95"
        >
          📋 Copiar
        </button>
        <button
          type="button"
          onClick={() => setShowDailyRate((v) => !v)}
          className={[
            "flex-1 min-w-[150px] rounded-2xl px-4 py-2.5 border text-white font-bold text-xs transition active:scale-95",
            showDailyRate ? "bg-cyan-400 text-slate-900 border-cyan-200" : "bg-white/10 hover:bg-white/20 border-white/15",
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
        <div className="rounded-2xl p-6 border border-purple-300/35 dark:border-purple-500/20 bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-[0_10px_30px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-extrabold flex items-center gap-2">🧾 Resultado</div>
            {badge}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/8 border border-white/10 p-3 text-center">
              <div className="text-[11px] opacity-70">Total</div>
              <div className="text-base font-extrabold">{result.periodDays}d</div>
            </div>
            <div className="rounded-2xl bg-white/8 border border-white/10 p-3 text-center">
              <div className="text-[11px] opacity-70">Usados</div>
              <div className="text-base font-extrabold">{result.daysUsed}d</div>
            </div>
            <div className="rounded-2xl bg-white/8 border border-white/10 p-3 text-center">
              <div className="text-[11px] opacity-70">Restantes</div>
              <div className="text-base font-extrabold">{result.daysRemaining}d</div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2.5 bg-white/10 font-extrabold text-sm">Plano atual</div>
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-sm">
                    {periodHuman[result.currentPlanPeriod]} • {result.currentPlan}
                  </div>
                  <div className="font-extrabold text-sm">
                    {formatMoney(result.currentValue)} <span className="opacity-70">{periodLabels[result.currentPlanPeriod]}</span>
                  </div>
                </div>

                {result.currentModules?.length ? (
                  <div className="pt-2 mt-2 border-t border-white/10 space-y-1.5">
                    {result.currentModules.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-[13px] opacity-90">
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

            <div className="text-center opacity-70 text-sm">⬇️</div>

            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2.5 bg-white/10 font-extrabold text-sm">Novo plano</div>
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-sm">
                    {periodHuman[result.newPlanPeriod]} • {result.newPlan}
                  </div>
                  <div className="font-extrabold text-sm">
                    {formatMoney(result.newValue)} <span className="opacity-70">{periodLabels[result.newPlanPeriod]}</span>
                  </div>
                </div>

                {result.newModules?.length ? (
                  <div className="pt-2 mt-2 border-t border-white/10 space-y-1.5">
                    {result.newModules.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-[13px] opacity-90">
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

          <div className="mt-5 rounded-2xl p-4 bg-white/8 border border-white/10">
            <div className="flex items-center justify-between text-[13px] py-2 border-b border-white/10">
              <div className="opacity-80">Crédito plano anterior</div>
              <div className="font-extrabold text-emerald-300">- {formatMoney(result.creditFromOldPlan)}</div>
            </div>

            {result.creditFromOldModules > 0 ? (
              <div className="flex items-center justify-between text-[13px] py-2 border-b border-white/10">
                <div className="opacity-80">Crédito módulos</div>
                <div className="font-extrabold text-emerald-300">- {formatMoney(result.creditFromOldModules)}</div>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-[13px] py-2 border-b border-white/10">
              <div className="opacity-80">Cobrança novo plano</div>
              <div className="font-extrabold text-amber-300">+ {formatMoney(result.chargeForNewPlan)}</div>
            </div>

            {result.chargeForNewModules > 0 ? (
              <div className="flex items-center justify-between text-[13px] py-2 border-b border-white/10">
                <div className="opacity-80">Cobrança módulos</div>
                <div className="font-extrabold text-amber-300">+ {formatMoney(result.chargeForNewModules)}</div>
              </div>
            ) : null}

            <div className="mt-3 pt-3 border-t border-white/15 flex items-end justify-between">
              <div className="font-extrabold text-sm">{amountLabel}</div>
              <div className="text-xl font-black text-cyan-300">{amountValue}</div>
            </div>
          </div>

          {actions}

          {showDailyRate ? (
            <div className="mt-5 rounded-2xl p-4 bg-cyan-400/10 border border-cyan-300/30">
              <div className="text-[11px] font-black text-cyan-300 uppercase tracking-wide mb-2">Taxa diária</div>

              <div className="flex items-center justify-between text-[13px] py-2 border-b border-white/10">
                <div className="opacity-80">Plano anterior</div>
                <div className="font-extrabold text-cyan-200">{formatMoney(result.currentValue / result.periodDays)}/dia</div>
              </div>

              <div className="flex items-center justify-between text-[13px] py-2 border-b border-white/10">
                <div className="opacity-80">Novo plano</div>
                <div className="font-extrabold text-cyan-200">{formatMoney(result.newValue / result.periodDays)}/dia</div>
              </div>

              {result.currentModules?.length
                ? result.currentModules.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-[13px] py-2 border-b border-white/10">
                      <div className="opacity-80">{m.name} (atual)</div>
                      <div className="font-extrabold text-cyan-200">{formatMoney(m.periodPrice / result.periodDays)}/dia</div>
                    </div>
                  ))
                : null}

              {result.newModules?.length
                ? result.newModules.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-[13px] py-2 border-b border-white/10">
                      <div className="opacity-80">{m.name} (novo)</div>
                      <div className="font-extrabold text-cyan-200">{formatMoney(m.periodPrice / result.periodDays)}/dia</div>
                    </div>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      );
    }

    // module result
    return (
      <div className="rounded-2xl p-6 border border-purple-300/35 dark:border-purple-500/20 bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-[0_10px_30px_rgba(0,0,0,0.32)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-base font-extrabold flex items-center gap-2">🧾 Resultado</div>
          <Badge variant="warning">A Cobrar</Badge>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/8 border border-white/10 p-3 text-center">
            <div className="text-[11px] opacity-70">Período</div>
            <div className="text-base font-extrabold">{result.periodDays}d</div>
          </div>
          <div className="rounded-2xl bg-white/8 border border-white/10 p-3 text-center">
            <div className="text-[11px] opacity-70">Restantes</div>
            <div className="text-base font-extrabold">{result.daysRemaining}d</div>
          </div>
        </div>

        {result.plan ? (
          <div className="mt-5 rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 bg-white/10 font-extrabold text-sm">Plano atual</div>
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="font-bold text-sm">
                {periodHuman[result.planPeriod]} • {result.plan}
              </div>
              <div className="font-extrabold text-sm">
                {formatMoney(result.planValue)} <span className="opacity-70">{periodLabels[result.planPeriod]}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-4 py-2.5 bg-white/10 font-extrabold text-sm">Módulos a adicionar</div>
          <div className="px-4 py-3 space-y-1.5">
            {result.modules.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-[13px]">
                <div className="opacity-90">• {m.name}</div>
                <div className="font-extrabold">
                  {formatMoney(m.periodPrice)} <span className="opacity-70">{periodLabels[result.planPeriod]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-2xl p-4 bg-white/8 border border-white/10">
          {result.modules.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-[13px] py-2 border-b border-white/10">
              <div className="opacity-80">{m.name}</div>
              <div className="font-extrabold text-amber-300">+ {formatMoney(m.proportionalValue)}</div>
            </div>
          ))}
          <div className="mt-3 pt-3 border-t border-white/15 flex items-end justify-between">
            <div className="font-extrabold text-sm">Valor a Cobrar</div>
            <div className="text-xl font-black text-cyan-300">{formatMoney(result.totalAmount)}</div>
          </div>
        </div>

        {actions}

        {showDailyRate ? (
          <div className="mt-5 rounded-2xl p-4 bg-cyan-400/10 border border-cyan-300/30">
            <div className="text-[11px] font-black text-cyan-300 uppercase tracking-wide mb-2">Taxa diária</div>
            {result.modules.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-[13px] py-2 border-b border-white/10">
                <div className="opacity-80">{m.name}</div>
                <div className="font-extrabold text-cyan-200">{formatMoney(m.dailyRate)}/dia</div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl p-3 bg-cyan-400/10 border border-cyan-300/30 text-sm">
          💡 Na próxima renovação, será cobrado o valor integral do período.
        </div>
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
            className="rounded-2xl px-3 py-2 bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 transition active:scale-95"
            title="Limpar histórico"
          >
            🗑️ Limpar
          </button>
        }
      >
        {!history.length ? (
          <div className="rounded-2xl p-6 border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/50 dark:bg-slate-800/40 text-center">
            <div className="text-2xl mb-2">📥</div>
            <div className="font-bold text-gray-800 dark:text-gray-200 text-sm">Nenhum cálculo salvo ainda</div>
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
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-extrabold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                        <span>{item.type === "plan" ? "🔁" : "🧩"}</span>
                        <span>{dateStr}</span>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">{details}</div>
                      <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">
                        {item.daysRemaining} dias restantes de {item.periodDays}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className={`font-black ${color} text-sm`}>
                        {sign} {formatMoney(Math.abs(total))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setDetailModal({ open: true, item })}
                        className="rounded-2xl px-3 py-2 bg-[#A543FB] text-white font-bold text-[11px] hover:brightness-110 transition active:scale-95"
                        title="Ver detalhes"
                      >
                        👁️ Ver
                      </button>

                      <button
                        type="button"
                        onClick={() => confirmDeleteHistoryItem(idx)}
                        className="rounded-2xl px-3 py-2 bg-white/70 dark:bg-slate-900/40 border border-purple-200/60 dark:border-purple-500/20 text-rose-600 font-black text-[11px] hover:bg-rose-50 dark:hover:bg-slate-900/60 transition active:scale-95"
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
        <div className="space-y-3">
          <div className="text-sm text-gray-600 dark:text-gray-300">📅 {dateStr}</div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/40 p-3 text-center">
              <div className="text-[11px] opacity-70">Período</div>
              <div className="font-black text-base">{item.periodDays}d</div>
            </div>
            <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/40 p-3 text-center">
              <div className="text-[11px] opacity-70">Usados</div>
              <div className="font-black text-base">{item.daysUsed}d</div>
            </div>
            <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/40 p-3 text-center">
              <div className="text-[11px] opacity-70">Restantes</div>
              <div className="font-black text-base">{item.daysRemaining}d</div>
            </div>
          </div>

          <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 overflow-hidden">
            <div className="px-4 py-2.5 bg-purple-50 dark:bg-slate-800/60 font-black text-sm">Plano atual</div>
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="font-bold text-sm">{periodHuman[item.currentPlanPeriod]} • {item.currentPlan}</div>
              <div className="font-black text-sm">{formatMoney(item.currentValue)} <span className="opacity-70">{periodLabels[item.currentPlanPeriod]}</span></div>
            </div>
            {item.currentModules?.length ? (
              <div className="px-4 pb-4 space-y-1.5">
                {item.currentModules.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-[13px] text-gray-700 dark:text-gray-200">
                    <div>• {m.name}</div>
                    <div className="font-bold">{formatMoney(m.periodPrice)} <span className="opacity-70">{periodLabels[item.currentPlanPeriod]}</span></div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="text-center opacity-60 text-sm">⬇️</div>

          <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 overflow-hidden">
            <div className="px-4 py-2.5 bg-purple-50 dark:bg-slate-800/60 font-black text-sm">Novo plano</div>
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="font-bold text-sm">{periodHuman[item.newPlanPeriod]} • {item.newPlan}</div>
              <div className="font-black text-sm">{formatMoney(item.newValue)} <span className="opacity-70">{periodLabels[item.newPlanPeriod]}</span></div>
            </div>
            {item.newModules?.length ? (
              <div className="px-4 pb-4 space-y-1.5">
                {item.newModules.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-[13px] text-gray-700 dark:text-gray-200">
                    <div>• {m.name}</div>
                    <div className="font-bold">{formatMoney(m.periodPrice)} <span className="opacity-70">{periodLabels[item.newPlanPeriod]}</span></div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl p-4 bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white">
            <div className="flex items-center justify-between text-[13px] py-2 border-b border-white/15">
              <div className="opacity-90">Crédito plano anterior</div>
              <div className="font-black">- {formatMoney(item.creditFromOldPlan)}</div>
            </div>
            {item.creditFromOldModules > 0 ? (
              <div className="flex items-center justify-between text-[13px] py-2 border-b border-white/15">
                <div className="opacity-90">Crédito módulos</div>
                <div className="font-black">- {formatMoney(item.creditFromOldModules)}</div>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-[13px] py-2 border-b border-white/15">
              <div className="opacity-90">Cobrança novo plano</div>
              <div className="font-black">+ {formatMoney(item.chargeForNewPlan)}</div>
            </div>
            {item.chargeForNewModules > 0 ? (
              <div className="flex items-center justify-between text-[13px] py-2 border-b border-white/15">
                <div className="opacity-90">Cobrança módulos</div>
                <div className="font-black">+ {formatMoney(item.chargeForNewModules)}</div>
              </div>
            ) : null}
            <div className="mt-3 pt-3 border-t border-white/20 flex items-end justify-between">
              <div className="font-black text-sm">{label}</div>
              <div className="text-xl font-black">{formatMoney(Math.abs(item.finalAmount))}</div>
            </div>
          </div>
        </div>
      );
    }

    // module
    return (
      <div className="space-y-3">
        <div className="text-sm text-gray-600 dark:text-gray-300">📅 {dateStr}</div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/40 p-3 text-center">
            <div className="text-[11px] opacity-70">Período</div>
            <div className="font-black text-base">{item.periodDays}d</div>
          </div>
          <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/40 p-3 text-center">
            <div className="text-[11px] opacity-70">Restantes</div>
            <div className="font-black text-base">{item.daysRemaining}d</div>
          </div>
        </div>

        {item.plan ? (
          <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 overflow-hidden">
            <div className="px-4 py-2.5 bg-purple-50 dark:bg-slate-800/60 font-black text-sm">Plano atual</div>
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="font-bold text-sm">{periodHuman[item.planPeriod]} • {item.plan}</div>
              <div className="font-black text-sm">{formatMoney(item.planValue)} <span className="opacity-70">{periodLabels[item.planPeriod]}</span></div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-purple-200/60 dark:border-purple-500/20 overflow-hidden">
          <div className="px-4 py-2.5 bg-purple-50 dark:bg-slate-800/60 font-black text-sm">Módulos adicionados</div>
          <div className="px-4 py-3 space-y-1.5">
            {item.modules.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-[13px] text-gray-700 dark:text-gray-200">
                <div>• {m.name}</div>
                <div className="font-bold">{formatMoney(m.proportionalValue)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white">
          <div className="flex items-end justify-between">
            <div className="font-black text-sm">Valor a Cobrar</div>
            <div className="text-xl font-black">{formatMoney(item.totalAmount)}</div>
          </div>
        </div>
      </div>
    );
  }

  /* =========================== FORMS =========================== */

  const PlanForm = (
    <Card title="Cenário: Mudança de Plano" icon="🔁">
      <div className="rounded-2xl p-4 border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/30 text-sm text-gray-700 dark:text-gray-200">
        ℹ️ O valor não utilizado do plano antigo vira <b>crédito</b>. O plano novo é cobrado proporcional aos dias restantes.
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-black text-gray-900 dark:text-white">Plano Atual</div>
            <div className="text-[11px] font-bold text-purple-700 dark:text-purple-300">⬇️</div>
          </div>

          <Label>Plano</Label>
          <SelectBase value={currentPlan} onChange={(e) => setCurrentPlan(e.target.value)}>
            <option value="">Selecione</option>
            <option value="delivery">Plano Delivery</option>
            <option value="mesas">Plano Mesas/Comandas</option>
            <option value="premium">Plano Premium</option>
          </SelectBase>

          <div className="mt-4">
            <Label>Período</Label>
            <SelectBase value={currentPlanPeriod} onChange={(e) => setCurrentPlanPeriod(e.target.value)}>
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </SelectBase>
          </div>

          <div className="mt-4">
            <Label>Valor do Plano (R$)</Label>
            <InputBase
              inputMode="decimal"
              placeholder="Ex.: 199,90"
              value={currentPlanValueText}
              onChange={(e) => setCurrentPlanValueText(e.target.value)}
            />
            <div className="text-[11px] text-gray-600 dark:text-gray-300 mt-2">
              Dica: pode digitar <b>199,90</b> ou <b>R$ 199,90</b>.
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Início do período</Label>
              <InputBase type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fim do período</Label>
              <InputBase type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <Label>Data da alteração</Label>
              <InputBase type="date" value={changeDate} onChange={(e) => setChangeDate(e.target.value)} />
            </div>
            <div>
              <Label>Dias restantes</Label>
              <div className="rounded-2xl border-2 border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/50 px-3 py-2.5 text-center">
                <div className="text-xl font-black text-purple-700 dark:text-purple-300">
                  {daysRemainingPlan == null ? "--" : daysRemainingPlan}
                </div>
                <div className="text-[11px] text-gray-600 dark:text-gray-300">dias</div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowCurrentMods((v) => !v)}
              className="flex items-center gap-2 text-sm font-extrabold text-gray-800 dark:text-gray-200 hover:text-purple-700 dark:hover:text-purple-300 transition"
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
          <div className="flex items-center justify-between mb-3">
            <div className="font-black text-gray-900 dark:text-white">Novo Plano</div>
            <div className="text-[11px] font-bold text-purple-700 dark:text-purple-300">⬆️</div>
          </div>

          <Label>Plano</Label>
          <SelectBase value={newPlan} onChange={(e) => setNewPlan(e.target.value)}>
            <option value="">Selecione</option>
            <option value="delivery">Plano Delivery</option>
            <option value="mesas">Plano Mesas/Comandas</option>
            <option value="premium">Plano Premium</option>
          </SelectBase>

          <div className="mt-4">
            <Label>Período</Label>
            <SelectBase value={newPlanPeriod} onChange={(e) => setNewPlanPeriod(e.target.value)}>
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </SelectBase>
          </div>

          <div className="mt-4">
            <Label>Valor do Novo Plano (R$)</Label>
            <InputBase
              inputMode="decimal"
              placeholder="Ex.: 249,90"
              value={newPlanValueText}
              onChange={(e) => setNewPlanValueText(e.target.value)}
            />
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowNewMods((v) => !v)}
              className="flex items-center gap-2 text-sm font-extrabold text-gray-800 dark:text-gray-200 hover:text-purple-700 dark:hover:text-purple-300 transition"
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

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={calculate}
          className="rounded-2xl px-5 py-3 bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white font-black shadow-[0_10px_24px_rgba(139,92,246,0.18)] hover:brightness-110 transition active:scale-95"
        >
          🧮 Calcular
        </button>
        <button
          type="button"
          onClick={clearForm}
          className="rounded-2xl px-5 py-3 bg-white/70 dark:bg-slate-800/70 border-2 border-purple-200/60 dark:border-purple-500/20 text-gray-800 dark:text-gray-100 font-black hover:bg-purple-50 dark:hover:bg-slate-800 transition active:scale-95"
        >
          🧽 Limpar
        </button>
      </div>
    </Card>
  );

  const ModuleForm = (
    <Card title="Cenário: Adicionar Módulo" icon="🧩">
      <div className="rounded-2xl p-4 border border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/30 text-sm text-gray-700 dark:text-gray-200">
        ℹ️ O módulo é cobrado apenas pelos dias entre a contratação e o fim do período atual.
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <Label>Plano contratado (opcional)</Label>
          <SelectBase value={modulePlan} onChange={(e) => setModulePlan(e.target.value)}>
            <option value="">Selecione</option>
            <option value="delivery">Plano Delivery</option>
            <option value="mesas">Plano Mesas/Comandas</option>
            <option value="premium">Plano Premium</option>
          </SelectBase>

          <div className="mt-4">
            <Label>Período</Label>
            <SelectBase value={modulePlanPeriod} onChange={(e) => setModulePlanPeriod(e.target.value)}>
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </SelectBase>
          </div>

          <div className="mt-4">
            <Label>Valor do Plano (R$) (opcional)</Label>
            <InputBase
              inputMode="decimal"
              placeholder="Ex.: 199,90"
              value={modulePlanValueText}
              onChange={(e) => setModulePlanValueText(e.target.value)}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Início do período</Label>
              <InputBase type="date" value={mStartDate} onChange={(e) => setMStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fim do período</Label>
              <InputBase type="date" value={mEndDate} onChange={(e) => setMEndDate(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <Label>Data da contratação</Label>
              <InputBase type="date" value={mChangeDate} onChange={(e) => setMChangeDate(e.target.value)} />
            </div>
            <div>
              <Label>Dias restantes</Label>
              <div className="rounded-2xl border-2 border-purple-200/60 dark:border-purple-500/20 bg-purple-50/40 dark:bg-slate-800/50 px-3 py-2.5 text-center">
                <div className="text-xl font-black text-purple-700 dark:text-purple-300">
                  {daysRemainingModule == null ? "--" : daysRemainingModule}
                </div>
                <div className="text-[11px] text-gray-600 dark:text-gray-300">dias</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="font-black text-gray-900 dark:text-white mb-3">Módulos a adicionar</div>
          <ModuleList
            period={modulePlanPeriod}
            selected={addModulesSel}
            setSelected={setAddModulesSel}
            overrides={addOverrides}
            setOverrides={setAddOverrides}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={calculate}
          className="rounded-2xl px-5 py-3 bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white font-black shadow-[0_10px_24px_rgba(139,92,246,0.18)] hover:brightness-110 transition active:scale-95"
        >
          🧮 Calcular
        </button>
        <button
          type="button"
          onClick={clearForm}
          className="rounded-2xl px-5 py-3 bg-white/70 dark:bg-slate-800/70 border-2 border-purple-200/60 dark:border-purple-500/20 text-gray-800 dark:text-gray-100 font-black hover:bg-purple-50 dark:hover:bg-slate-800 transition active:scale-95"
        >
          🧽 Limpar
        </button>
      </div>
    </Card>
  );

  return (
    <div className="text-sm">
      <Toast toast={toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />

      {Header}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
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
              className="flex-1 rounded-2xl px-4 py-2.5 bg-white/70 dark:bg-slate-800/70 border-2 border-purple-200/60 dark:border-purple-500/20 font-black text-gray-800 dark:text-gray-100 hover:bg-purple-50 dark:hover:bg-slate-800 transition active:scale-95"
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
              className="flex-1 rounded-2xl px-4 py-2.5 bg-rose-500 text-white font-black hover:bg-rose-600 transition active:scale-95"
            >
              Confirmar
            </button>
          </div>
        }
      >
        <div className="text-gray-700 dark:text-gray-200 text-sm">{confirmModal.message}</div>
      </Modal>

      <Modal
        open={detailModal.open}
        title="Detalhes do cálculo"
        onClose={() => setDetailModal({ open: false, item: null })}
        footer={
          <button
            type="button"
            onClick={() => setDetailModal({ open: false, item: null })}
            className="w-full rounded-2xl px-5 py-3 bg-gradient-to-br from-[#A543FB] to-[#7e22ce] text-white font-black hover:brightness-110 transition active:scale-95"
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
