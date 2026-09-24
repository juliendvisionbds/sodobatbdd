// =====================================================================
// Historique en mode « par ligne » : table plate pour la recherche
// transverse. Désignations verbatim, libellé propre en infobulle.
// =====================================================================

import Link from "next/link";
import {
  date as fmtDate,
  nombre,
  LIBELLES_UNITES,
  LIBELLES_ZONES,
  type LigneHistorique,
} from "@/lib/types";

export function TableLignesHistorique({
  lignes,
  indexe,
}: {
  lignes: LigneHistorique[];
  indexe: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="vx-tbl min-w-[860px]">
        <thead>
          <tr>
            <th>Date</th>
            <th>Client</th>
            <th>Désignation (verbatim)</th>
            <th>Unité</th>
            <th className="vx-r">Qté</th>
            <th className="vx-r">{indexe ? "PU actualisé" : "PU HT"}</th>
            <th className="vx-r">Total HT</th>
            <th>Zone</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr
              key={l.id}
              className={`transition-colors hover:bg-bg-soft ${l.excluAgregats ? "text-sub" : ""}`}
            >
              <td className="mono whitespace-nowrap text-[13px] text-sub">
                {fmtDate(l.date)}
              </td>
              <td className="max-w-[170px] truncate font-medium" title={l.client ?? undefined}>
                {l.client ?? "—"}
                {l.estTs && (
                  <span className="badge b-amber ml-1.5 !px-1.5 !py-0 !text-[10.5px]">TS</span>
                )}
              </td>
              <td className="max-w-[340px]">
                <span
                  className={`block truncate ${l.excluAgregats ? "line-through decoration-line-strong" : ""}`}
                  title={l.ouvrage?.libelleDevis ?? undefined}
                >
                  {l.designationBrute}
                </span>
                {l.ouvrage && (
                  <Link
                    href={`/?ouvrage=${l.ouvrage.id}`}
                    className="text-[12px] font-medium text-navy underline-offset-2 hover:underline"
                  >
                    {l.ouvrage.libelleDevis}
                  </Link>
                )}
              </td>
              <td className="text-[13px] text-sub">
                {l.unite ? LIBELLES_UNITES[l.unite] : (l.uniteBrute ?? "—")}
              </td>
              <td className="vx-cell-amount">{nombre(l.quantite)}</td>
              <td className="vx-cell-key">
                {nombre(indexe ? l.puIndexe : l.pu)}
              </td>
              <td className="vx-cell-amount">{nombre(l.total)}</td>
              <td className="whitespace-nowrap text-[13px] text-sub">
                {l.zone ? LIBELLES_ZONES[l.zone] : "—"}
                {l.zone && !l.zoneFiable && (
                  <span
                    className="badge b-amber ml-1"
                    title="Zone déduite de l'adresse du client"
                  >
                    déduite
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
