"use client";

// Filtres en pastilles : Lot (arbre), Zone (multi), Période, Type,
// Unité, Fiabilité, n minimum, Affichage. Tout vit dans l'URL.

import { useEffect, useRef, useState } from "react";
import { useParamsUrl } from "./useParamsUrl";
import { LIBELLES_ZONES, LIBELLES_UNITES } from "@/lib/types";
import type { CodeUnite, CodeZone, LotNoeud } from "@/lib/types";

const ZONES = Object.keys(LIBELLES_ZONES) as CodeZone[];
const UNITES: CodeUnite[] = ["m2", "ml", "m3", "u", "kg", "h"];
const ANNEES = ["2024", "2025", "2026"];

export function Pastille({
  libelle,
  actif,
  enfants,
}: {
  libelle: string;
  actif: boolean;
  enfants: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    };
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", clavier);
    return () => {
      document.removeEventListener("mousedown", fermer);
      document.removeEventListener("keydown", clavier);
    };
  }, [ouvert]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        aria-pressed={actif}
        className="vx-chip"
      >
        {libelle} <span aria-hidden className="ml-0.5 text-[10px] opacity-70">▾</span>
      </button>
      {ouvert && (
        <div className="vx-menu absolute left-0 top-full z-30 mt-1.5 min-w-[210px]">
          {enfants}
        </div>
      )}
    </div>
  );
}

export function Case({
  coche,
  libelle,
  basculer,
}: {
  coche: boolean;
  libelle: string;
  basculer: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-[13.5px] hover:bg-navy-tint">
      <input type="checkbox" checked={coche} onChange={basculer} className="accent-[var(--navy)]" />
      {libelle}
    </label>
  );
}

function libelleLot(lots: LotNoeud[], id: string | null): string | null {
  for (const l of lots) {
    if (l.id === id) return l.libelle;
    const e = libelleLot(l.enfants, id);
    if (e) return e;
  }
  return null;
}

function OptionsLot({
  lots,
  profondeur,
  lotActif,
  sansPrix,
  choisir,
}: {
  lots: LotNoeud[];
  profondeur: number;
  lotActif: string | null;
  sansPrix: boolean;
  choisir: (id: string | null) => void;
}) {
  return (
    <>
      {lots.map((l) => (
        <span key={l.id} className="block">
          <label
            className="flex cursor-pointer items-center gap-2.5 rounded-[7px] py-1.5 pr-2.5 text-[13.5px] hover:bg-navy-tint"
            style={{ paddingLeft: 10 + profondeur * 16 }}
          >
            <input
              type="checkbox"
              checked={lotActif === l.id}
              onChange={() => choisir(lotActif === l.id ? null : l.id)}
              className="accent-[var(--navy)]"
            />
            <span className="flex-1 truncate">{l.libelle}</span>
            <span className="mono text-[11.5px] text-faint">
              {sansPrix ? l.nbOuvragesCumule : l.nbAvecPrixCumule}
            </span>
          </label>
          {l.enfants.length > 0 && (
            <OptionsLot lots={l.enfants} profondeur={profondeur + 1}
              lotActif={lotActif} sansPrix={sansPrix} choisir={choisir} />
          )}
        </span>
      ))}
    </>
  );
}

export function Filtres({
  nbActifs,
  lots = [],
}: {
  nbActifs: number;
  lots?: LotNoeud[];
}) {
  const { params, modifier } = useParamsUrl();
  const lot = params.get("lot");

  const zones = params.get("zones")?.split(",").filter(Boolean) ?? [];
  const unites = params.get("unites")?.split(",").filter(Boolean) ?? [];
  const type = params.get("type") ?? "tous";
  const fiab = params.get("fiab") ?? "";
  const nmin = params.get("nmin") ?? "";
  const depuis = params.get("depuis") ?? "";
  const jusqua = params.get("jusqua") ?? "";
  const sansPrix = params.get("sansprix") === "1";

  const basculerListe = (cle: string, liste: string[], valeur: string) => {
    const suivante = liste.includes(valeur)
      ? liste.filter((v) => v !== valeur)
      : [...liste, valeur];
    modifier({ [cle]: suivante.join(",") || null });
  };

  const anneeActive = (a: string) =>
    depuis === `${a}-01-01` && jusqua === `${a}-12-31`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {lots.length > 0 && (
        <Pastille libelle={libelleLot(lots, lot) ?? "Lot"} actif={Boolean(lot)} enfants={
          <span className="block min-w-[260px]">
            <Case coche={!lot} libelle="Tous les lots" basculer={() => modifier({ lot: null })} />
            <OptionsLot lots={lots} profondeur={0} lotActif={lot} sansPrix={sansPrix}
              choisir={(id) => modifier({ lot: id })} />
          </span>
        } />
      )}
      <Pastille libelle="Zone" actif={zones.length > 0} enfants={
        <>
          {ZONES.map((z) => (
            <Case key={z} coche={zones.includes(z)} libelle={LIBELLES_ZONES[z]}
              basculer={() => basculerListe("zones", zones, z)} />
          ))}
        </>
      } />

      <Pastille libelle={depuis || jusqua ? "Période active" : "2024–2026"} actif={Boolean(depuis || jusqua)} enfants={
        <>
          {ANNEES.map((a) => (
            <Case key={a} coche={anneeActive(a)} libelle={a}
              basculer={() =>
                anneeActive(a)
                  ? modifier({ depuis: null, jusqua: null })
                  : modifier({ depuis: `${a}-01-01`, jusqua: `${a}-12-31` })
              } />
          ))}
          <div className="mt-1.5 border-t border-hairline pt-2">
            <div className="grid grid-cols-2 gap-2 px-2.5 pb-1">
              <label className="text-[12px] font-semibold text-sub">
                Du
                <input type="date" value={depuis}
                  onChange={(e) => modifier({ depuis: e.target.value || null })}
                  className="vx-select mt-1 w-full !px-2 !py-1.5 !text-[13px]" />
              </label>
              <label className="text-[12px] font-semibold text-sub">
                Au
                <input type="date" value={jusqua}
                  onChange={(e) => modifier({ jusqua: e.target.value || null })}
                  className="vx-select mt-1 w-full !px-2 !py-1.5 !text-[13px]" />
              </label>
            </div>
          </div>
        </>
      } />

      <Pastille
        libelle={type === "normaux" ? "Normaux" : type === "ts" ? "TS" : "Normaux + TS"}
        actif={type !== "tous"}
        enfants={
          <>
            {[
              ["tous", "Normaux + TS"],
              ["normaux", "Normaux seulement"],
              ["ts", "TS seulement"],
            ].map(([v, lib]) => (
              <Case key={v} coche={type === v} libelle={lib}
                basculer={() => modifier({ type: v === "tous" ? null : v })} />
            ))}
          </>
        }
      />

      <Pastille libelle="Unité" actif={unites.length > 0} enfants={
        <>
          {UNITES.map((u) => (
            <Case key={u} coche={unites.includes(u)} libelle={LIBELLES_UNITES[u]}
              basculer={() => basculerListe("unites", unites, u)} />
          ))}
        </>
      } />

      <Pastille libelle="Fiabilité" actif={Boolean(fiab || nmin)} enfants={
        <>
          {[
            ["", "Toutes"],
            ["moyenne", "À confirmer ou mieux"],
            ["haute", "Fiable uniquement"],
          ].map(([v, lib]) => (
            <Case key={v || "toutes"} coche={fiab === v} libelle={lib}
              basculer={() => modifier({ fiab: v || null })} />
          ))}
          <div className="mt-1.5 border-t border-hairline px-2.5 pb-1 pt-2">
            <label className="text-[12px] font-semibold text-sub">
              n minimum
              <input
                type="number" min={0} value={nmin}
                onChange={(e) => modifier({ nmin: e.target.value || null })}
                className="vx-select mono mt-1 w-full !px-2 !py-1.5 !text-[13px]"
              />
            </label>
          </div>
        </>
      } />

      <Pastille libelle="Affichage" actif={sansPrix} enfants={
        <Case coche={sansPrix} libelle="Afficher les ouvrages sans prix"
          basculer={() => modifier({ sansprix: sansPrix ? null : "1" })} />
      } />

      {nbActifs > 0 && (
        <button
          type="button"
          onClick={() =>
            modifier({
              q: null, lot: null, zones: null, type: null, unites: null,
              depuis: null, jusqua: null, nmin: null, fiab: null,
              sansprix: null,
            })
          }
          className="vx-btn-ghost ml-1"
        >
          Effacer les filtres ({nbActifs})
        </button>
      )}
    </div>
  );
}
