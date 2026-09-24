"use client";

// Carte utilisateur en haut à droite (avatar, libellé, rôle). Au clic :
// menu contenant la déconnexion.

import { useEffect, useRef, useState } from "react";
import { deconnecter } from "@/lib/actions/auth";

function initiales(libelle: string): string {
  const mots = libelle.trim().split(/\s+/).filter(Boolean);
  if (mots.length >= 2) return (mots[0][0] + mots[1][0]).toUpperCase();
  return libelle.slice(0, 2).toUpperCase();
}

export function MenuUtilisateur({
  libelle,
  estAdmin = false,
}: {
  libelle?: string | null;
  estAdmin?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function surClicExterieur(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    function clavier(e: KeyboardEvent) {
      if (e.key === "Escape") setOuvert(false);
    }
    document.addEventListener("mousedown", surClicExterieur);
    document.addEventListener("keydown", clavier);
    return () => {
      document.removeEventListener("mousedown", surClicExterieur);
      document.removeEventListener("keydown", clavier);
    };
  }, []);

  const nom = libelle ?? "Utilisateur";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        className="vx-user text-left transition-colors hover:border-navy"
      >
        <span className="vx-avatar" aria-hidden>
          {initiales(nom)}
        </span>
        <span>
          <span className="vx-user__name block">{nom}</span>
          <span className="vx-user__meta block">
            {estAdmin ? "Administrateur" : "Métreur"}
          </span>
        </span>
      </button>

      {ouvert && (
        <div
          role="menu"
          className="vx-menu absolute right-0 top-[calc(100%+6px)] z-[70] min-w-[200px]"
        >
          <form action={deconnecter}>
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-[7px] px-3 py-2 text-left text-[13.5px] text-sub hover:bg-navy-tint hover:text-navy"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
