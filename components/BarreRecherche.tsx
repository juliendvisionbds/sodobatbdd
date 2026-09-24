"use client";

// Recherche floue : focus automatique au chargement, Cmd/Ctrl+K pour y
// revenir, debounce 200 ms.

import { useEffect, useRef, useState } from "react";
import { useParamsUrl } from "./useParamsUrl";

export function BarreRecherche({
  placeholder = "Rechercher un ouvrage…",
}: {
  placeholder?: string;
}) {
  const { params, modifier } = useParamsUrl();
  const [valeur, setValeur] = useState(params.get("q") ?? "");
  const ref = useRef<HTMLInputElement>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, []);

  const changer = (v: string) => {
    setValeur(v);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      modifier({ q: v.trim() || null });
    }, 200);
  };

  return (
    <div className="relative min-w-[min(100%,320px)] flex-1">
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <circle cx={9} cy={9} r={6} />
        <path d="m13.5 13.5 4 4" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        type="search"
        value={valeur}
        onChange={(e) => changer(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="vx-input w-full !pl-10 !pr-12 placeholder:text-faint"
      />
      <kbd className="mono pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-[6px] border border-line bg-surface px-1.5 py-0.5 text-[10.5px] text-faint sm:block">
        ⌘K
      </kbd>
    </div>
  );
}
