// src/App.jsx
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import SupportInsights from "./components/SupportInsights.jsx";
import VideoCenter from "./components/VideoCenter.jsx";
import Conversor from "./components/Conversor.jsx";
import PlanilhaOficial from "./components/PlanilhaOficial.jsx";

export default function App() {
  const sectionCard =
    "rounded-2xl p-8 border backdrop-blur-lg " +
    "bg-black/40 border-[#9D00FF]/30 shadow-[0_0_20px_rgba(157,0,255,0.25)]";

  const titleBadge =
    "w-14 h-14 rounded-xl flex items-center justify-center " +
    "bg-gradient-to-r from-[#9D00FF] to-[#B84CFF]";

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-black/70 backdrop-blur-md border-b border-[#9D00FF]/20">
          <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#9D00FF] to-[#B84CFF] bg-clip-text text-transparent">
              Ferramentas Internas CW
            </h1>
            <nav className="flex gap-6 text-gray-300 font-medium">
              <Link to="/" className="hover:text-white transition">Planilha</Link>
              <Link to="/insights" className="hover:text-white transition">Insights</Link>
              <Link to="/videos" className="hover:text-white transition">Vídeos</Link>
            </nav>
          </div>
        </header>

        {/* Main */}
        <main className="mx-auto max-w-6xl px-6 py-12 space-y-12">
          <Routes>
            {/* Página principal: Planilha + Conversor */}
            <Route
              index
              element={
                <>
                  <PlanilhaOficial />
                  <section className={sectionCard}>
                    <Conversor />
                  </section>
                </>
              }
            />

            {/* Página de Insights */}
            <Route
              path="/insights"
              element={
                <section className={sectionCard}>
                  <div className="flex items-center gap-4 mb-6">
                    <div className={titleBadge}>
                      <span className="text-2xl">📊</span>
                    </div>
                    <h2 className="text-2xl font-bold">Painel de Insights</h2>
                  </div>
                  <SupportInsights />
                </section>
              }
            />

            {/* Página de Vídeos */}
            <Route
              path="/videos"
              element={
                <section className={sectionCard}>
                  <VideoCenter />
                </section>
              }
            />

            {/* Catch-all: redireciona para a home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="text-center text-gray-300 py-8 border-t border-gray-800">
          <p className="text-sm">Desenvolvido por Mickael Maciel</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}
