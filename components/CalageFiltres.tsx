"use client";

// Filtres partagés des files de calage (par ouvrage, ligne à ligne,
// sans ouvrage) : lot, méthode de proposition, statut de la pièce,
// recherche. Tout vit dans l'URL, l'onglet courant est conservé.

import { useEffect, useState } from "react";
import { Case, Pastille } from "./Filtres";
import { useParamsUrl } from "./useParamsUrl";

const METHODES: Array<{ cle: string; libelle: string }> = [
  { cle: "regle", libelle: "Proposées par règle (score)" },
  { cle: "llm", libelle: "Proposées par l'IA" },
  { cle: "auto", libelle: "Validées automatiquement" },
];
const PIECES: Array<{ cle: string; libelle: string }> = [
  { cle: "a_revoir", libelle: "Pièce à revoir" },
  { cle: "valide", libelle: "Pièce validée" },
];

export function CalageFiltres({
  lots,
  nbActifs,
  sansMethode = false,
  sansLot = false,
}: {
  lots: Array<{ id: string; code: string; libelle: string }>;
  nbActifs: number;
  sansMethode?: boolean;
  sansLot?: boolean;
}) {
  const { params, modifier } = useParamsUrl();
  const lot = params.get("lot") ?? "";
  const methode = params.get("methode") ?? "";
  const doc = params.get("doc") ?? "";
  const q = params.get("q") ?? "";
  const [saisie, setSaisie] = useState(q);
  useEffect(() => setSaisie(q), [q]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <input
        type="search"
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") modifier({ q: saisie.trim() || null });
        }}
        onBlur={() => {
          if (saisie.trim() !== q) modifier({ q: saisie.trim() || null });
        }}
        placeholder="Désignation ou ouvrage…"
        aria-label="Rechercher dans la file"
        className="vx-input !min-w-[240px] !py-[7px]"
      />
      {!sansLot && (
        <Pastille libelle="Lot" actif={Boolean(lot)} enfants={
          <>
            {lots.map((l) => (
              <Case key={l.id} coche={lot === l.id} libelle={`${l.code} · ${l.libelle}`}
                basculer={() => modifier({ lot: lot === l.id ? null : l.id })} />
            ))}
          </>
        } />
      )}
      {!sansMethode && (
        <Pastille libelle="Méthode" actif={Boolean(methode)} enfants={
          <>
            {METHODES.map((m) => (
              <Case key={m.cle} coche={methode === m.cle} libelle={m.libelle}
                basculer={() => modifier({ methode: methode === m.cle ? null : m.cle })} />
            ))}
          </>
        } />
      )}
      <Pastille libelle="Pièce" actif={Boolean(doc)} enfants={
        <>
          {PIECES.map((p) => (
            <Case key={p.cle} coche={doc === p.cle} libelle={p.libelle}
              basculer={() => modifier({ doc: doc === p.cle ? null : p.cle })} />
          ))}
        </>
      } />
      {nbActifs > 0 && (
        <button
          type="button"
          onClick={() => modifier({ lot: null, methode: null, doc: null, q: null })}
          className="vx-btn-ghost"
        >
          Effacer ({nbActifs})
        </button>
      )}
    </div>
  );
}
