"use client";

// Tableau des frais de chantier : part médiane du chantier, montant
// médian, n, taille des chantiers observés. Clic → fiche ouvrage.

import { useParamsUrl } from "./useParamsUrl";
import { EtiquetteN } from "./ReglettePrix";
import { euro, nombre, type FraisResume } from "@/lib/types";

export function TableauFrais({ lignes }: { lignes: FraisResume[] }) {
  const { modifier } = useParamsUrl();
  const ouvrir = (id: string) => modifier({ ouvrage: id }, true);

  if (lignes.length === 0) {
    return (
      <p className="py-16 text-center text-[15px] text-sub">
        Aucun ouvrage forfaitaire pour le moment.
      </p>
    );
  }

  return (
    <table className="vx-tbl">
      <thead>
        <tr>
          <th>Lot</th>
          <th>Poste</th>
          <th className="vx-r">Part du chantier</th>
          <th className="vx-r">Montant médian</th>
          <th className="vx-r">n</th>
          <th className="vx-r">Chantiers observés</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((l) => {
          const s = l.normaux ?? l.ts;
          return (
            <tr
              key={l.ouvrage.id}
              tabIndex={0}
              onClick={() => ouvrir(l.ouvrage.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  ouvrir(l.ouvrage.id);
                }
              }}
              aria-label={`Ouvrir la fiche : ${l.ouvrage.libelleDevis}`}
              className="vx-tbl__row"
            >
              <td><span className="mono text-[12px] text-faint">{l.ouvrage.lotCode ?? "—"}</span></td>
              <td><span className="line-clamp-2 text-[14px] leading-snug">{l.ouvrage.libelleDevis}</span></td>
              <td className="vx-cell-amount">
                {s ? (
                  <span className="mono text-[13.5px] font-medium text-navy">{nombre(s.pctMedianChantier, 1)} %</span>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
              <td className="vx-cell-amount">{s ? euro(s.montantMedian) : <span className="text-faint">—</span>}</td>
              <td className="vx-cell-amount">{s ? <EtiquetteN n={s.n} /> : <span className="text-faint">—</span>}</td>
              <td className="vx-cell-amount">
                {s ? (
                  <span className="mono text-[12.5px] text-sub">{euro(s.chantierMin)} – {euro(s.chantierMax)}</span>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
