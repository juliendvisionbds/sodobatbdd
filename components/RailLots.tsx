"use client";

// Rail gauche : arborescence des lots, repliable, 220px.
// Chaque nœud affiche son cumul d'ouvrages (sous-lots compris).
// Masqué sous 1024px ; un sélecteur le remplace (voir TableauPrix).

import { useState } from "react";
import { useParamsUrl } from "./useParamsUrl";
import type { LotNoeud } from "@/lib/types";

function Noeud({
  lot,
  profondeur,
  lotActif,
  choisir,
  sansPrix,
}: {
  lot: LotNoeud;
  profondeur: number;
  lotActif: string | null;
  choisir: (id: string | null) => void;
  sansPrix: boolean;
}) {
  const [replie, setReplie] = useState(false);
  const actif = lotActif === lot.id;
  const compte = sansPrix ? lot.nbOuvragesCumule : lot.nbAvecPrixCumule;

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-[7px] px-1.5 py-[5px] text-[13.5px] transition-colors ${
          actif ? "bg-navy font-semibold text-white" : "text-ink hover:bg-navy-tint"
        }`}
        style={{ paddingLeft: 6 + profondeur * 14 }}
      >
        {lot.enfants.length > 0 ? (
          <button
            type="button"
            aria-label={replie ? `Déplier ${lot.libelle}` : `Replier ${lot.libelle}`}
            onClick={() => setReplie((r) => !r)}
            aria-expanded={!replie}
            className={`w-4 shrink-0 text-[10px] ${actif ? "text-white/80" : "text-faint"}`}
          >
            <span
              aria-hidden
              className="inline-block transition-transform duration-150"
              style={{ transform: replie ? "none" : "rotate(90deg)" }}
            >
              ▸
            </span>
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => choisir(actif ? null : lot.id)}
          className="flex min-w-0 flex-1 items-baseline justify-between gap-2 text-left"
        >
          <span className="truncate">{lot.libelle}</span>
          <span className={`mono text-[11.5px] ${actif ? "text-white/80" : "text-faint"}`}>
            {compte}
          </span>
        </button>
      </div>
      {!replie &&
        lot.enfants.map((e) => (
          <Noeud key={e.id} lot={e} profondeur={profondeur + 1}
            lotActif={lotActif} choisir={choisir} sansPrix={sansPrix} />
        ))}
    </div>
  );
}

export function RailLots({ lots }: { lots: LotNoeud[] }) {
  const { params, modifier } = useParamsUrl();
  const lotActif = params.get("lot");
  const sansPrix = params.get("sansprix") === "1";
  const choisir = (id: string | null) => modifier({ lot: id });

  return (
    <aside className="hidden w-[230px] shrink-0 border-r border-hairline lg:block">
      <div className="sticky top-[150px] max-h-[calc(100vh-170px)] overflow-y-auto pb-2 pr-3 pt-3">
        <div className="vx-table__group mb-1 !px-1.5 !pt-0">Lots</div>
        <button
          type="button"
          onClick={() => choisir(null)}
          className={`mb-1 w-full rounded-[7px] px-2 py-[5px] text-left text-[13.5px] ${
            !lotActif ? "bg-navy font-semibold text-white" : "text-sub hover:bg-navy-tint"
          }`}
        >
          Tous les lots
        </button>
        {lots.map((l) => (
          <Noeud key={l.id} lot={l} profondeur={0} lotActif={lotActif} choisir={choisir} sansPrix={sansPrix} />
        ))}
      </div>
    </aside>
  );
}
