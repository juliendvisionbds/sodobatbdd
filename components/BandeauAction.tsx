"use client";

// Bandeau inline affiché après un geste de calage : « 156 lignes
// validées vers … [Annuler (Z)] ». Disparaît au prochain geste ou après
// un délai. Le raccourci Z est actif tant que le bandeau est visible.

import { useEffect } from "react";

export interface DernierGeste {
  message: string;
  /** Nombre de rattachements touchés (pour le libellé). */
  n: number;
}

export function BandeauAction({
  geste,
  enCours,
  annuler,
  effacer,
  delaiMs = 12000,
}: {
  geste: DernierGeste | null;
  enCours: boolean;
  annuler: () => void;
  effacer: () => void;
  delaiMs?: number;
}) {
  useEffect(() => {
    if (!geste) return;
    const minuteur = setTimeout(effacer, delaiMs);
    const clavier = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName)) return;
      if (e.key.toLowerCase() === "z" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        annuler();
      }
    };
    window.addEventListener("keydown", clavier);
    return () => {
      clearTimeout(minuteur);
      window.removeEventListener("keydown", clavier);
    };
  }, [geste, annuler, effacer, delaiMs]);

  if (!geste) return null;

  return (
    <div
      role="status"
      className="vx-insight vx-insight--pos mb-4 flex flex-wrap items-center gap-3 !py-3"
    >
      <span className="text-[14px] font-medium text-green">{geste.message}</span>
      <button
        type="button"
        disabled={enCours}
        onClick={annuler}
        className="vx-btn-outline ml-auto !gap-2 !py-1.5"
      >
        <kbd className="mono rounded-[6px] border border-navy-line bg-navy-tint px-1.5 py-0.5 text-[11.5px] text-navy">
          Z
        </kbd>
        {enCours ? "Annulation…" : "Annuler"}
      </button>
    </div>
  );
}
