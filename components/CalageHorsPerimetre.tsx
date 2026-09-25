"use client";

// Onglet « Hors périmètre » : lignes que l'IA a écartées (administratif,
// illisible). À relire : réintégrer (elle repasse dans « Sans ouvrage »)
// ou confirmer l'exclusion.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmerHorsPerimetreAction,
  reintegrerHorsPerimetreAction,
} from "@/lib/actions/calage";
import {
  date as fmtDate,
  nombre,
  LIBELLES_UNITES,
  type LigneCalage,
  type Page,
} from "@/lib/types";
import { BadgeStatutDocument } from "./BadgeStatutDocument";
import { Pagination } from "./Pagination";

export function CalageHorsPerimetre({ page }: { page: Page<LigneCalage> }) {
  const router = useRouter();
  const [lignes, setLignes] = useState(page.lignes);
  const [pageRef, setPageRef] = useState(page);
  if (pageRef !== page) {
    setPageRef(page);
    setLignes(page.lignes);
  }
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const ids = (l?: LigneCalage) => (l ? [l.id] : [...selection]);
  const retirer = (retires: string[]) => {
    const s = new Set(retires);
    setLignes((ls) => ls.filter((x) => !s.has(x.id)));
    setSelection(new Set());
  };

  const reintegrer = (l?: LigneCalage) =>
    demarrer(async () => {
      const cibles = ids(l);
      const n = await reintegrerHorsPerimetreAction(cibles);
      retirer(cibles);
      setMessage(`${n} ligne${n > 1 ? "s" : ""} réintégrée${n > 1 ? "s" : ""} : à rattacher dans « Sans ouvrage » (ou par npm run rattacher).`);
      router.refresh();
    });

  const confirmer = (l?: LigneCalage) =>
    demarrer(async () => {
      const cibles = ids(l);
      const n = await confirmerHorsPerimetreAction(cibles);
      retirer(cibles);
      setMessage(`${n} exclusion${n > 1 ? "s" : ""} confirmée${n > 1 ? "s" : ""}.`);
      router.refresh();
    });

  const basculer = (id: string) =>
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <p className="vx-insight !py-3 mb-4 text-[13.5px]">
        L&apos;IA a écarté ces lignes comme administratives ou illisibles. Une
        prestation réelle (même d&apos;un autre corps d&apos;état) doit être
        <strong> réintégrée</strong> : elle rejoint la file « Sans ouvrage ».
      </p>
      {message && (
        <p className="vx-insight vx-insight--pos mb-4 !py-3 text-[14px] font-medium text-green">{message}</p>
      )}

      {lignes.length === 0 ? (
        <p className="vx-panel py-16 text-center text-[15px] text-sub">
          Aucune ligne écartée à relire.
        </p>
      ) : (
        <div className="vx-panel !p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-3">
            <span className="text-[13px] text-sub">{selection.size} sélectionnée{selection.size > 1 ? "s" : ""}</span>
            <span className="flex-1" />
            <button type="button" disabled={enCours || selection.size === 0} onClick={() => confirmer()} className="vx-btn-outline disabled:opacity-40">
              Confirmer l&apos;exclusion ({selection.size})
            </button>
            <button type="button" disabled={enCours || selection.size === 0} onClick={() => reintegrer()} className="vx-btn !px-4 !py-2 !text-[14px] disabled:opacity-40">
              Réintégrer ({selection.size})
            </button>
          </div>
          <table className="vx-tbl">
            <thead>
              <tr>
                <th className="!w-8">
                  <input
                    type="checkbox"
                    aria-label="Tout cocher"
                    checked={lignes.length > 0 && selection.size === lignes.length}
                    onChange={(e) => setSelection(e.target.checked ? new Set(lignes.map((l) => l.id)) : new Set())}
                    className="accent-[var(--navy)]"
                  />
                </th>
                <th>Désignation (verbatim)</th>
                <th>Pièce</th>
                <th className="vx-r">Qté</th>
                <th className="vx-r">PU HT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input type="checkbox" aria-label="Sélectionner la ligne" checked={selection.has(l.id)}
                      onChange={() => basculer(l.id)} className="accent-[var(--navy)]" />
                  </td>
                  <td className="max-w-[460px]">
                    <span className="line-clamp-2 text-[13.5px] leading-snug" title={l.designationBrute}>{l.designationBrute}</span>
                    <span className="text-[12px] text-faint">
                      {l.unite ? LIBELLES_UNITES[l.unite] : (l.uniteBrute ?? "—")}
                      {l.motifHorsPerimetre && l.motifHorsPerimetre !== "llm" && (
                        <span className="badge b-neutre ml-1.5">{l.motifHorsPerimetre}</span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-[12.5px] text-sub">
                    {l.numeroDocument ?? "—"} · {fmtDate(l.date)}
                    {l.client && <span className="block max-w-[180px] truncate" title={l.client}>{l.client}</span>}
                    <BadgeStatutDocument statut={l.statutDocument} className="mt-0.5" />
                  </td>
                  <td className="vx-cell-amount">{nombre(l.quantite)}</td>
                  <td className="vx-cell-amount">{nombre(l.pu)}</td>
                  <td className="whitespace-nowrap text-right">
                    <button type="button" disabled={enCours} onClick={() => confirmer(l)} className="vx-btn-ghost mr-1.5">Exclure</button>
                    <button type="button" disabled={enCours} onClick={() => reintegrer(l)} className="vx-btn-outline !py-1.5">Réintégrer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page.page} total={page.total} parPage={page.parPage} />
    </div>
  );
}
