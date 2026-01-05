import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useDarkMode } from "./hooks/useDarkMode";
import Conversor from "./components/Conversor.jsx";
import PlanilhaOficial from "./components/PlanilhaOficial.jsx";
import SupportInsights from "./components/SupportInsights.jsx";
import VideoCenter from "./components/VideoCenter.jsx";
import Financeiro from "./components/Financeiro.jsx"; // ✅ ADICIONADO
import ChatWidget from "./components/ChatWidget/index.jsx";

/* Sobe o scroll ao trocar de rota */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [pathname]);
  return null;
}

export default function App() {
  const { isDark, toggleDarkMode } = useDarkMode();

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <div className="min-h-screen relative bg-gradient-to-br from-gray-50 via-purple-50 to-white dark:from-slate-900 dark:via-purple-900 dark:to-slate-900 text-gray-800 dark:text-white transition-colors duration-300">
        {/* BG decorativo */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-200/30 dark:bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-200/20 dark:bg-violet-500/15 rounded-full blur-3xl animate-float"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-purple-100/40 dark:bg-purple-600/10 rounded-full blur-3xl"></div>
        </div>

        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl border-b border-purple-200/50 dark:border-purple-500/20 shadow-lg">
          <div className="mx-auto max-w-7xl px-6 py-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg border border-purple-400/30">
                <span className="text-2xl">🛠️</span>
              </div>
              <h1 className="text-4xl font-bold text-gradient">Ferramentas Internas CW</h1>
            </div>

            <div className="flex items-center gap-4">
              <nav className="flex items-center gap-2 bg-purple-50/80 dark:bg-slate-800/60 rounded-full p-2 backdrop-blur-lg border border-purple-200/50 dark:border-purple-500/20">
                <NavLink to="/" end className="nav-link px-6 py-3 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300">
                  📋 Planilha
                </NavLink>
                <NavLink to="/insights" className="nav-link px-6 py-3 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300">
                  📊 Insights
                </NavLink>
                <NavLink to="/videos" className="nav-link px-6 py-3 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300">
                  🎥 Vídeos
                </NavLink>
                <NavLink to="/financeiro" className="nav-link px-6 py-3 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300">
                  💰 Financeiro
                </NavLink>
              </nav>

              {/* Toggle Dark */}
              <button
                onClick={toggleDarkMode}
                className="w-12 h-12 rounded-full bg-purple-100/80 dark:bg-slate-700/80 border border-purple-200/50 dark:border-purple-500/20 backdrop-blur-lg flex items-center justify-center transition-all duration-300 hover:bg-purple-200/80 dark:hover:bg-slate-600/80 hover:scale-110 active:scale-95"
                title="Alternar tema claro/escuro"
              >
                <span className="text-xl transition-transform duration-300">
                  {isDark ? "☀️" : "🌙"}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="relative z-10 mx-auto max-w-7xl px-6 py-12 space-y-16">
          <Routes>
            <Route
              index
              element={
                <>
                  <PlanilhaOficial />
                  <Conversor />
                </>
              }
            />

            <Route
              path="/insights"
              element={
                <section className="rounded-3xl p-8 border backdrop-blur-xl bg-white/80 dark:bg-black/40 border-purple-300/50 dark:border-purple-500/30 shadow-[0_8px_32px_rgba(139,92,246,0.2)]">
                  <SupportInsights />
                </section>
              }
            />

            <Route
              path="/videos"
              element={
                <section className="rounded-3xl p-8 border backdrop-blur-xl bg-white/80 dark:bg-black/40 border-purple-300/50 dark:border-purple-500/30 shadow-[0_8px_32px_rgba(139,92,246,0.2)]">
                  <VideoCenter />
                </section>
              }
            />

            {/* ✅ NOVA ROTA */}
            <Route
              path="/financeiro"
              element={
                <section className="space-y-10">
                  <Financeiro />
                </section>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="relative z-10 text-center py-12 mt-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="bg-white dark:bg-slate-900 backdrop-blur-lg rounded-3xl border border-purple-300/50 dark:border-purple-500/20 p-8 shadow-[0_8px_32px_rgba(139,92,246,0.2)]">
              <p className="text-gray-800 dark:text-gray-100 font-medium text-lg mb-4">
                ✨ Desenvolvido por{" "}
                <span className="font-bold text-purple-600 dark:text-purple-400">Mickael Maciel</span>
              </p>
              <div className="flex justify-center items-center gap-8 text-gray-700 dark:text-gray-300 text-sm">
                <div className="flex items-center gap-2"><span>🚀</span><span>Ferramentas Internas</span></div>
                <div className="w-2 h-2 bg-purple-400 dark:bg-purple-500 rounded-full" />
                <div className="flex items-center gap-2"><span>⚡</span><span>Alta Performance</span></div>
                <div className="w-2 h-2 bg-purple-400 dark:bg-purple-500 rounded-full" />
                <div className="flex items-center gap-2"><span>🔧</span><span>Sempre Atualizando</span></div>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Widget montado fora das rotas: aparece em TODAS as páginas */}
      <ChatWidget
        endpoint="/api/support"
        title="CW • Suporte"
        accent="from-[#A543FB] to-[#7e22ce]"
        startOpen={false}
      />
    </BrowserRouter>
  );
}
