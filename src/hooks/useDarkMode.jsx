import { useState, useEffect } from "react";

export const useDarkMode = () => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    const prefers = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    return saved ? saved === "dark" : !!prefers;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      if (!localStorage.getItem("theme")) setIsDark(e.matches);
    };
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  const toggleDarkMode = () => setIsDark((v) => !v);
  return { isDark, toggleDarkMode };
};
