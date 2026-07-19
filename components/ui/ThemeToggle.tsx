"use client";
// Light/dark toggle. Persists the choice; the no-FOUC script in the layout
// applies it before paint on load.
import { useEffect, useState } from "react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`ui-btn ui-btn-ghost !h-9 !w-9 !p-0 rounded-full ${className}`}
    >
      <span aria-hidden="true">{dark ? "☀" : "☾"}</span>
    </button>
  );
}
