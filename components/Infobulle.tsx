"use client";

// Infobulle légère, sans bibliothèque : s'ouvre au survol, au focus
// clavier et au clic (utile dans une ligne de tableau cliquable : le
// clic sur le déclencheur n'ouvre pas la fiche). Échap ferme.

import { useEffect, useId, useState } from "react";

export function Infobulle({
  contenu,
  children,
  largeur = 260,
}: {
  contenu: React.ReactNode;
  children: React.ReactNode;
  largeur?: number;
}) {
  const [ouverte, setOuverte] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!ouverte) return;
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuverte(false);
    };
    document.addEventListener("keydown", clavier);
    return () => document.removeEventListener("keydown", clavier);
  }, [ouverte]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOuverte(true)}
      onMouseLeave={() => setOuverte(false)}
    >
      <button
        type="button"
        aria-describedby={ouverte ? id : undefined}
        aria-expanded={ouverte}
        onClick={(e) => {
          e.stopPropagation();
          setOuverte((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
        onFocus={() => setOuverte(true)}
        onBlur={() => setOuverte(false)}
        className="inline-flex cursor-help items-center rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-navy"
      >
        {children}
      </button>
      {ouverte && (
        <span
          role="tooltip"
          id={id}
          className="vx-tip"
          style={{ width: largeur }}
          onClick={(e) => e.stopPropagation()}
        >
          {contenu}
        </span>
      )}
    </span>
  );
}

/** Le petit ⓘ à côté d'un prix. */
export function IconeInfo({ libelle = "Détail du prix" }: { libelle?: string }) {
  return (
    <span
      aria-label={libelle}
      className="vx-tip__icone"
    >
      i
    </span>
  );
}

/** Ligne « libellé … valeur » d'une infobulle. */
export function LigneInfo({
  libelle,
  valeur,
  accent = false,
}: {
  libelle: string;
  valeur: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-sub">{libelle}</span>
      <span className={`mono ${accent ? "font-semibold text-navy" : ""}`}>{valeur}</span>
    </span>
  );
}
