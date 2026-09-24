"use client";

// Coquille de superposition (Échap ou clic hors panneau pour fermer) et
// dialogue de confirmation partagé par les écrans de calage.

import { useEffect, useRef } from "react";

export function Superposee({
  titre,
  fermer,
  children,
  largeur = 560,
}: {
  titre: string;
  fermer: () => void;
  children: React.ReactNode;
  largeur?: number;
}) {
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", clavier);
    return () => document.removeEventListener("keydown", clavier);
  }, [fermer]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-[rgba(30,34,38,.28)] px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fermer();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className="vx-panel w-full"
        style={{ maxWidth: largeur }}
      >
        <h2 className="vx-panel__title mb-4">{titre}</h2>
        {children}
      </div>
    </div>
  );
}

/** Confirmation explicite. Entrée confirme, Échap ferme, le focus part
 *  sur « Annuler » : une action irréversible ne se déclenche jamais par
 *  une frappe distraite. */
export function DialogueConfirmation({
  titre,
  corps,
  libelleConfirmer = "Confirmer",
  ton = "normal",
  enCours = false,
  confirmer,
  fermer,
}: {
  titre: string;
  corps: React.ReactNode;
  libelleConfirmer?: string;
  ton?: "normal" | "danger";
  enCours?: boolean;
  confirmer: () => void;
  fermer: () => void;
}) {
  const refAnnuler = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    refAnnuler.current?.focus();
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !enCours) {
        e.preventDefault();
        confirmer();
      }
    };
    document.addEventListener("keydown", clavier);
    return () => document.removeEventListener("keydown", clavier);
  }, [confirmer, enCours]);

  return (
    <Superposee titre={titre} fermer={fermer} largeur={520}>
      <div className="text-[14px] leading-relaxed text-sub">{corps}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          ref={refAnnuler}
          type="button"
          onClick={fermer}
          className="vx-btn-outline"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={confirmer}
          className={
            ton === "danger"
              ? "rounded-[9px] border border-red bg-surface px-4 py-2 text-[14px] font-semibold text-red transition-colors hover:bg-red-bg disabled:opacity-40"
              : "vx-btn !px-4 !py-2 !text-[14px]"
          }
        >
          {enCours ? "…" : libelleConfirmer}
        </button>
      </div>
    </Superposee>
  );
}
