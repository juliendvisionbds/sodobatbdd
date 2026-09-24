// =====================================================================
// /demo/reglette — écran de contrôle du composant signature.
// Non lié dans la navigation. Les sept états côte à côte.
// =====================================================================

import { notFound } from "next/navigation";
import { ReglettePrix, EtiquetteN } from "@/components/ReglettePrix";
import type { StatsPrix } from "@/lib/types";

function fabrique(partiel: Partial<StatsPrix>): StatsPrix {
  const base: StatsPrix = {
    ouvrageId: "demo",
    niveau: "type",
    estTs: false,
    zone: null,
    n: 12,
    nChantiers: 9,
    min: 112,
    max: 226,
    moyenne: 152,
    mediane: 147,
    quartiles: { p25: 138, p75: 168 },
    ecartType: 26,
    coefVariation: 0.18,
    medianeIndexee: 147,
    moyenneIndexee: 152,
    minIndexe: 112,
    maxIndexe: 226,
    quartilesIndexes: { p25: 138, p75: 168 },
    premiereOccurrence: "2024-02-01",
    derniereOccurrence: "2026-04-10",
    quantiteCumulee: 480,
    fiabilite: "haute",
    zoneToujoursFiable: true,
  };
  return { ...base, ...partiel };
}

const CAS: Array<{ titre: string; note: string; stats: StatsPrix }> = [
  {
    titre: "Fiabilité haute",
    note: "n ≥ 10 et CV < 25 % : encre pleine.",
    stats: fabrique({}),
  },
  {
    titre: "Fiabilité moyenne",
    note: "n ≥ 4 : opacité 55 %.",
    stats: fabrique({ n: 6, fiabilite: "moyenne" }),
  },
  {
    titre: "Fiabilité faible",
    note: "Contour seul, médiane en tirets.",
    stats: fabrique({ n: 5, fiabilite: "faible" }),
  },
  {
    titre: "n = 1",
    note: "Un point plein, n en ton « vigilance ». Pas de réglette de largeur nulle.",
    stats: fabrique({
      n: 1,
      min: 320,
      max: 320,
      mediane: 320,
      moyenne: 320,
      quartiles: null,
      quartilesIndexes: null,
      minIndexe: 320,
      maxIndexe: 320,
      medianeIndexee: 320,
      moyenneIndexee: 320,
      fiabilite: "faible",
    }),
  },
  {
    titre: "n = 3 (quartiles null)",
    note: "Filet min→max et médiane seuls, sans rectangle.",
    stats: fabrique({
      n: 3,
      quartiles: null,
      quartilesIndexes: null,
      fiabilite: "faible",
    }),
  },
  {
    titre: "min = max",
    note: "Dispersion nulle : un trait épais. Signal fort et positif.",
    stats: fabrique({
      n: 5,
      min: 147,
      max: 147,
      minIndexe: 147,
      maxIndexe: 147,
      quartiles: { p25: 147, p75: 147 },
      quartilesIndexes: { p25: 147, p75: 147 },
      fiabilite: "moyenne",
    }),
  },
  {
    titre: "Échelle tronquée",
    note: "max > p75 × 3 : échelle coupée à p75 × 1,5, chevron » avec infobulle.",
    stats: fabrique({
      n: 13,
      max: 4000,
      maxIndexe: 4000,
      fiabilite: "haute",
    }),
  },
];

export default function PageDemoReglette() {
  // écran de contrôle réservé au développement
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="eyebrow">Écran de contrôle</div>
      <h1 className="mt-2 text-[22px] font-semibold">
        ReglettePrix — les sept états
      </h1>
      <p className="mt-2 max-w-[58ch] text-sub">
        La densité d&apos;encre encode la fiabilité. La réglette suggère, le
        chiffre affirme.
      </p>

      <div className="mt-8 divide-y divide-line border-y border-line">
        {CAS.map((cas) => (
          <div
            key={cas.titre}
            className="grid grid-cols-1 items-center gap-4 py-5 sm:grid-cols-[180px_1fr_1fr]"
          >
            <div>
              <div className="text-[13px] font-semibold">{cas.titre}</div>
              <div className="mt-0.5 text-xs text-sub">{cas.note}</div>
            </div>
            <div className="flex items-center gap-2">
              <ReglettePrix stats={cas.stats} indexe={false} />
              <EtiquetteN n={cas.stats.n} />
            </div>
            <div className="flex items-center gap-2">
              <ReglettePrix
                stats={cas.stats}
                indexe={false}
                variante="detaillee"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <div className="mb-3 text-[13px] font-semibold">
          Variante TS (teinte --ts, jamais une pastille)
        </div>
        <div className="flex items-center gap-2">
          <ReglettePrix stats={fabrique({ estTs: true })} indexe={false} ts />
          <EtiquetteN n={12} />
        </div>
      </div>
    </main>
  );
}
