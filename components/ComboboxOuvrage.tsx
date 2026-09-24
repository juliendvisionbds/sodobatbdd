"use client";

// Recherche d'un ouvrage canonique (touche M du calage, « Changer
// d'ouvrage », « Rattacher… »). Flèches pour naviguer, Entrée pour
// choisir, Échap pour fermer.

import { useEffect, useRef, useState } from "react";
import { rechercherOuvragesAction } from "@/lib/actions/calage";
import type { Ouvrage } from "@/lib/types";
import { Superposee } from "./Superposee";

export function ComboboxOuvrage({
  titre = "Modifier l'ouvrage cible",
  contexte,
  fermer,
  choisir,
}: {
  titre?: string;
  /** Rappel de la ligne concernée, affiché sous le titre. */
  contexte?: React.ReactNode;
  fermer: () => void;
  choisir: (o: Ouvrage) => void;
}) {
  const [requete, setRequete] = useState("");
  const [resultats, setResultats] = useState<Ouvrage[]>([]);
  const [surligne, setSurligne] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => ref.current?.focus(), []);

  const chercher = (v: string) => {
    setRequete(v);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(async () => {
      setResultats(await rechercherOuvragesAction(v));
      setSurligne(0);
    }, 180);
  };

  return (
    <Superposee titre={titre} fermer={fermer}>
      {contexte && (
        <p className="-mt-2 mb-3 text-[13px] text-sub">{contexte}</p>
      )}
      <input
        ref={ref}
        type="search"
        value={requete}
        onChange={(e) => chercher(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSurligne((s) => Math.min(s + 1, resultats.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSurligne((s) => Math.max(s - 1, 0));
          } else if (e.key === "Enter" && resultats[surligne]) {
            e.preventDefault();
            choisir(resultats[surligne]);
          } else if (e.key === "Escape") {
            fermer();
          }
        }}
        placeholder="Rechercher un ouvrage canonique…"
        aria-label="Rechercher un ouvrage canonique"
        className="vx-input w-full"
      />
      <ul className="mt-2 max-h-[300px] overflow-y-auto">
        {resultats.map((o, i) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => choisir(o)}
              onMouseEnter={() => setSurligne(i)}
              className={`w-full rounded-[7px] px-2.5 py-2 text-left text-[13.5px] ${
                i === surligne ? "bg-navy-tint" : ""
              }`}
            >
              <span className="mono mr-2 text-[12px] text-sub">
                {o.code ?? "—"}
              </span>
              {o.libelleDevis}
              <span className="ml-2 text-[11px] text-sub">
                {o.lotLibelle ?? ""}
              </span>
            </button>
          </li>
        ))}
        {requete && resultats.length === 0 && (
          <li className="px-2 py-2 text-[13px] text-sub">
            Rien pour «&nbsp;{requete}&nbsp;».
          </li>
        )}
      </ul>
    </Superposee>
  );
}
