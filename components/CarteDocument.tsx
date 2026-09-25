// =====================================================================
// Carte document de l'historique — dépliable sur ses lignes, verbatim.
// Composant serveur : l'état ouvert/fermé vit dans l'URL (?doc=).
// =====================================================================

import Link from "next/link";
import {
  date as fmtDate,
  euro,
  nombre,
  LIBELLES_UNITES,
  LIBELLES_ZONES,
  type DocumentDetail,
  type DocumentResume,
} from "@/lib/types";

import { BoutonModifierDocument } from "./FormulaireDocument";

const LIBELLES_TYPE_DOC: Record<string, string> = {
  devis: "DEV",
  facture: "FAC",
  situation: "SIT",
  avenant: "AVE",
  indetermine: "PIÈCE",
};

export function CarteDocument({
  doc,
  detail,
  hrefBascule,
  peutModifier = false,
}: {
  doc: DocumentResume;
  detail: DocumentDetail | null;
  hrefBascule: string;
  /** administrateur : bouton « Modifier la pièce » dans le détail */
  peutModifier?: boolean;
}) {
  const ouvert = detail !== null;
  const incomplete = !doc.date || !doc.zone || !doc.client;

  return (
    <article className="border-b border-hairline">
      <Link
        href={hrefBascule}
        scroll={false}
        aria-expanded={ouvert}
        className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[8px] px-2 py-3 transition-colors ${
          ouvert ? "bg-navy-tint" : "hover:bg-bg-soft"
        }`}
      >
        <span aria-hidden className="vx-chev inline-block w-3">
          ▸
        </span>
        <span className="mono text-[13.5px] font-medium text-navy">
          {doc.numero ?? LIBELLES_TYPE_DOC[doc.type]}
        </span>
        {doc.estTs && <span className="badge b-amber">TS</span>}
        <span className="mono text-[13px] text-sub">{doc.date ? fmtDate(doc.date) : "sans date"}</span>
        {incomplete && (
          <span className="badge b-amber" title="Date, zone ou client manquant : à compléter dans le calage">
            à compléter
          </span>
        )}
        <span className="text-[14px] font-semibold">
          {doc.client?.nom ?? "Client inconnu"}
        </span>
        {doc.chantierObjet && (
          <span className="min-w-0 flex-1 truncate text-[14px] text-sub">
            {doc.chantierObjet}
          </span>
        )}
        <span className="text-[12.5px] text-faint">
          {[doc.chantierCommune, doc.zone ? LIBELLES_ZONES[doc.zone] : null]
            .filter(Boolean)
            .join(" · ")}
          {doc.zone && !doc.zoneFiable && (
            <span
              className="badge b-amber ml-1.5"
              title="Zone déduite de l'adresse du client, pas du chantier"
            >
              zone déduite
            </span>
          )}
        </span>
        {doc.statut === "a_revoir" && (
          <span className="badge b-red">à revoir</span>
        )}
        <span className="mono ml-auto text-[13.5px] font-medium text-navy">
          {euro(doc.totalHt)}{" "}
          <span className="font-sans text-[11.5px] font-normal text-faint">HT</span>
        </span>
      </Link>

      {ouvert && detail && (
        <div className="vx-detail mb-3 mt-1 !block">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                <th className="cote-label pb-2 pr-3">Désignation (verbatim)</th>
                <th className="cote-label pb-2 pr-3">Unité</th>
                <th className="cote-label pb-2 pr-3 text-right">Qté</th>
                <th className="cote-label pb-2 pr-3 text-right">PU HT</th>
                <th className="cote-label pb-2 text-right">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {detail.lignes.map((l) => (
                <tr
                  key={l.id}
                  className={`border-t border-hairline text-[13.5px] ${
                    l.excluAgregats ? "text-sub line-through decoration-line-strong" : ""
                  }`}
                >
                  <td
                    className="max-w-[420px] truncate py-1.5 pr-3"
                    title={l.motifExclusion ?? undefined}
                  >
                    {l.designationBrute}
                  </td>
                  <td className="py-1.5 pr-3 text-[13px] text-sub">
                    {l.unite ? LIBELLES_UNITES[l.unite] : (l.uniteBrute ?? "—")}
                  </td>
                  <td className="mono py-1.5 pr-3 text-right">{nombre(l.quantite)}</td>
                  <td className="mono py-1.5 pr-3 text-right">{nombre(l.pu)}</td>
                  <td className="mono py-1.5 text-right">{nombre(l.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-[13.5px] font-semibold">
                <td colSpan={4} className="pt-2.5 pr-3 text-right text-sub">
                  Total HT
                  {detail.ecartTotal != null && detail.ecartTotal !== 0 && (
                    <span className="badge b-red ml-2">
                      écart {euro(detail.ecartTotal)}
                    </span>
                  )}
                </td>
                <td className="mono pt-2.5 text-right text-navy">{euro(doc.totalHt)}</td>
              </tr>
            </tfoot>
          </table>
          {peutModifier && (
            <div className="mt-3">
              <BoutonModifierDocument
                doc={{
                  id: doc.id, date: doc.date, typeDocument: doc.type, estTs: doc.estTs, numero: doc.numero,
                  client: doc.client?.nom ?? null, chantierObjet: doc.chantierObjet,
                  chantierCodePostal: detail?.chantierCodePostal ?? null,
                  chantierCommune: doc.chantierCommune, zone: doc.zone,
                }}
              />
            </div>
          )}
          {doc.lienPdf && (
            <p className="mt-3 text-right">
              <a
                href={doc.lienPdf}
                target="_blank"
                rel="noreferrer"
                className="vx-btn-outline"
              >
                Voir la pièce d&apos;origine →
              </a>
            </p>
          )}
        </div>
      )}
    </article>
  );
}
