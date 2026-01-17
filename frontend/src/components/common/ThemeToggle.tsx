"use client";

import { useTheme } from "@/context/ThemeContext";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative flex items-center justify-center w-10 h-10 rounded-lg border transition-all duration-300 ${
        theme === "dark"
          ? "bg-slate-800 border-slate-600 hover:bg-slate-700 hover:border-slate-500"
          : "bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300"
      } ${className}`}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
    >
      {/* Sun icon (for dark mode - click to go light) */}
      <svg
        className={`w-5 h-5 absolute transition-all duration-300 ${
          theme === "dark"
            ? "opacity-100 rotate-0 scale-100 text-yellow-400"
            : "opacity-0 rotate-90 scale-0 text-yellow-500"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>

      {/* Moon icon (for light mode - click to go dark) */}
      <svg
        className={`w-5 h-5 absolute transition-all duration-300 ${
          theme === "light"
            ? "opacity-100 rotate-0 scale-100 text-slate-600"
            : "opacity-0 -rotate-90 scale-0 text-slate-400"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
    </button>
  );
}

