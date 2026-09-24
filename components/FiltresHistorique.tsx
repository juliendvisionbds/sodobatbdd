"use client";

// Filtres de l'historique : période, type de document, zone, montant,
// normaux / TS, et bascule de mode d'affichage. Tout vit dans l'URL.

import { useParamsUrl } from "./useParamsUrl";
import { Pastille, Case } from "./Filtres";
import { LIBELLES_ZONES } from "@/lib/types";
import type { CodeZone } from "@/lib/types";

const ZONES = Object.keys(LIBELLES_ZONES) as CodeZone[];
const ANNEES = ["2024", "2025", "2026"];
const TYPES_DOC: Array<[string, string]> = [
  ["devis", "Devis"],
  ["facture", "Factures"],
  ["situation", "Situations"],
  ["avenant", "Avenants"],
];

export function FiltresHistorique({ nbActifs }: { nbActifs: number }) {
  const { params, modifier } = useParamsUrl();

  const zones = params.get("zones")?.split(",").filter(Boolean) ?? [];
  const types = params.get("types")?.split(",").filter(Boolean) ?? [];
  const type = params.get("type") ?? "tous";
  const depuis = params.get("depuis") ?? "";
  const jusqua = params.get("jusqua") ?? "";
  const min = params.get("min") ?? "";
  const max = params.get("max") ?? "";
  const mode = params.get("mode") === "lignes" ? "lignes" : "documents";

  const basculerListe = (cle: string, liste: string[], valeur: string) => {
    const suivante = liste.includes(valeur)
      ? liste.filter((v) => v !== valeur)
      : [...liste, valeur];
    modifier({ [cle]: suivante.join(",") || null });
  };

  const anneeActive = (a: string) =>
    depuis === `${a}-01-01` && jusqua === `${a}-12-31`;

  return (
    <div className="flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-1.5">
      <Pastille
        libelle={depuis || jusqua ? "Période active" : "2024–2026"}
        actif={Boolean(depuis || jusqua)}
        enfants={
          <>
            {ANNEES.map((a) => (
              <Case
                key={a}
                coche={anneeActive(a)}
                libelle={a}
                basculer={() =>
                  anneeActive(a)
                    ? modifier({ depuis: null, jusqua: null })
                    : modifier({ depuis: `${a}-01-01`, jusqua: `${a}-12-31` })
                }
              />
            ))}
            <div className="mt-1.5 border-t border-hairline pt-2">
              <div className="grid grid-cols-2 gap-2 px-2.5 pb-1">
                <label className="text-[12px] font-semibold text-sub">
                  Du
                  <input
                    type="date"
                    value={depuis}
                    onChange={(e) => modifier({ depuis: e.target.value || null })}
                    className="vx-select mt-1 w-full !px-2 !py-1.5 !text-[13px]"
                  />
                </label>
                <label className="text-[12px] font-semibold text-sub">
                  Au
                  <input
                    type="date"
                    value={jusqua}
                    onChange={(e) => modifier({ jusqua: e.target.value || null })}
                    className="vx-select mt-1 w-full !px-2 !py-1.5 !text-[13px]"
                  />
                </label>
              </div>
            </div>
          </>
        }
      />

      <Pastille
        libelle="Type de document"
        actif={types.length > 0}
        enfants={
          <>
            {TYPES_DOC.map(([v, lib]) => (
              <Case
                key={v}
                coche={types.includes(v)}
                libelle={lib}
                basculer={() => basculerListe("types", types, v)}
              />
            ))}
          </>
        }
      />

      <Pastille
        libelle="Zone"
        actif={zones.length > 0}
        enfants={
          <>
            {ZONES.map((z) => (
              <Case
                key={z}
                coche={zones.includes(z)}
                libelle={LIBELLES_ZONES[z]}
                basculer={() => basculerListe("zones", zones, z)}
              />
            ))}
          </>
        }
      />

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
              <Case
                key={v}
                coche={type === v}
                libelle={lib}
                basculer={() => modifier({ type: v === "tous" ? null : v })}
              />
            ))}
          </>
        }
      />

      <Pastille
        libelle="Montant"
        actif={Boolean(min || max)}
        enfants={
          <div className="grid grid-cols-2 gap-2 px-2.5 py-1.5">
            <label className="text-[12px] font-semibold text-sub">
              Min (€ HT)
              <input
                type="number"
                min={0}
                value={min}
                onChange={(e) => modifier({ min: e.target.value || null })}
                className="vx-select mono mt-1 w-full !px-2 !py-1.5 !text-[13px]"
              />
            </label>
            <label className="text-[12px] font-semibold text-sub">
              Max (€ HT)
              <input
                type="number"
                min={0}
                value={max}
                onChange={(e) => modifier({ max: e.target.value || null })}
                className="vx-select mono mt-1 w-full !px-2 !py-1.5 !text-[13px]"
              />
            </label>
          </div>
        }
      />

      {nbActifs > 0 && (
        <button
          type="button"
          onClick={() =>
            modifier({
              q: null, client: null, zones: null, types: null, type: null,
              depuis: null, jusqua: null, min: null, max: null, doc: null,
            })
          }
          className="vx-btn-ghost"
        >
          Effacer les filtres ({nbActifs})
        </button>
      )}

      {/* ---------- bascule de mode ---------- */}
      <div
        role="group"
        aria-label="Mode d'affichage"
        className="vx-seg ml-auto"
      >
        {[
          ["documents", "Par document"],
          ["lignes", "Par ligne"],
        ].map(([v, lib]) => (
          <button
            key={v}
            type="button"
            aria-pressed={mode === v}
            onClick={() =>
              modifier({ mode: v === "documents" ? null : v, doc: null })
            }
            className="vx-seg__opt"
          >
            {lib}
          </button>
        ))}
      </div>
    </div>
  );
}
