"use client";

// Onglet « Sans ouvrage » : lignes à prix qu'aucune proposition n'a
// couvertes (hors périmètre exclu). Rattacher à un ouvrage existant, en
// une fois pour toutes les désignations identiques, ou créer l'ouvrage.

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  annulerDerniereActionAction,
  rattacherLignesAction,
} from "@/lib/actions/calage";
import {
  date as fmtDate,
  nombre,
  LIBELLES_UNITES,
  type LigneCalage,
  type Page,
} from "@/lib/types";
import { BadgeStatutDocument } from "./BadgeStatutDocument";
import { BandeauAction, type DernierGeste } from "./BandeauAction";
import { ComboboxOuvrage } from "./ComboboxOuvrage";
import { FormulaireNouvelOuvrage } from "./FormulaireNouvelOuvrage";
import { Pagination } from "./Pagination";

export function CalageSansOuvrage({
  page,
  lots,
}: {
  page: Page<LigneCalage>;
  lots: Array<{ id: string; code: string; libelle: string }>;
}) {
  const router = useRouter();
  const [lignes, setLignes] = useState(page.lignes);
  const [pageRef, setPageRef] = useState(page);
  if (pageRef !== page) {
    setPageRef(page);
    setLignes(page.lignes);
  }
  const [rattacher, setRattacher] = useState<LigneCalage | null>(null);
  const [creer, setCreer] = useState<LigneCalage | null>(null);
  const [aussiIdentiques, setAussiIdentiques] = useState(true);
  const [geste, setGeste] = useState<DernierGeste | null>(null);
  const [enCours, demarrer] = useTransition();

  const retirer = (l: LigneCalage, aussi: boolean) =>
    setLignes((ls) =>
      ls.filter((x) =>
        aussi
          ? x.designationBrute.toLowerCase() !== l.designationBrute.toLowerCase() && x.id !== l.id
          : x.id !== l.id,
      ),
    );

  const choisirOuvrage = (ouvrageId: string, libelle: string) => {
    const l = rattacher;
    if (!l) return;
    const aussi = aussiIdentiques && (l.nbIdentiques ?? 1) > 1;
    setRattacher(null);
    demarrer(async () => {
      const ids = await rattacherLignesAction([l.id], ouvrageId, { aussiIdentiques: aussi });
      retirer(l, aussi);
      setGeste({
        message: `${ids.length} ligne${ids.length > 1 ? "s" : ""} rattachée${ids.length > 1 ? "s" : ""} à « ${libelle} »`,
        n: ids.length,
      });
      router.refresh();
    });
  };

  const annuler = useCallback(() => {
    if (enCours) return;
    demarrer(async () => {
      await annulerDerniereActionAction();
      setGeste(null);
      router.refresh();
    });
  }, [enCours, router]);

  return (
    <div>
      <BandeauAction geste={geste} enCours={enCours} annuler={annuler} effacer={() => setGeste(null)} />

      {lignes.length === 0 ? (
        <p className="vx-panel py-16 text-center text-[15px] text-sub">
          Toutes les lignes à prix ont un ouvrage.
        </p>
      ) : (
        <div className="vx-panel !p-0">
          <table className="vx-tbl">
            <thead>
              <tr>
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
                  <td className="max-w-[460px]">
                    <span className="line-clamp-2 text-[13.5px] leading-snug" title={l.designationBrute}>
                      {l.designationBrute}
                    </span>
                    <span className="text-[12px] text-faint">
                      {l.unite ? LIBELLES_UNITES[l.unite] : (l.uniteBrute ?? "—")}
                      {(l.nbIdentiques ?? 1) > 1 && (
                        <span className="badge b-navy ml-1.5" title="Même désignation dans d'autres pièces">
                          ×{l.nbIdentiques} identiques
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-[12.5px] text-sub">
                    {l.numeroDocument ?? "—"} · {fmtDate(l.date)}
                    {l.client && <span className="block max-w-[180px] truncate" title={l.client}>{l.client}</span>}
                    <BadgeStatutDocument statut={l.statutDocument} controleLigne={l.controleLigne} className="mt-0.5" />
                  </td>
                  <td className="vx-cell-amount">{nombre(l.quantite)}</td>
                  <td className="vx-cell-amount">{nombre(l.pu)}</td>
                  <td className="whitespace-nowrap text-right">
                    <button type="button" disabled={enCours} onClick={() => setRattacher(l)} className="vx-btn-outline mr-1.5 !py-1.5">
                      Rattacher…
                    </button>
                    <button type="button" disabled={enCours} onClick={() => setCreer(l)} className="vx-btn-ghost">
                      Nouvel ouvrage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page.page} total={page.total} parPage={page.parPage} />

      {rattacher && (
        <ComboboxOuvrage
          titre="Rattacher à un ouvrage"
          contexte={
            <>
              « {rattacher.designationBrute} »
              {(rattacher.nbIdentiques ?? 1) > 1 && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={aussiIdentiques}
                    onChange={(e) => setAussiIdentiques(e.target.checked)}
                    className="accent-[var(--navy)]"
                  />
                  Rattacher aussi les {rattacher.nbIdentiques! - 1} autres lignes identiques
                </label>
              )}
            </>
          }
          fermer={() => setRattacher(null)}
          choisir={(o) => choisirOuvrage(o.id, o.libelleDevis)}
        />
      )}
      {creer && (
        <FormulaireNouvelOuvrage
          ligneId={creer.id}
          designation={creer.designationBrute}
          unite={creer.unite}
          lots={lots}
          fermer={() => setCreer(null)}
          apres={(ids) => {
            const l = creer;
            setCreer(null);
            retirer(l, false);
            setGeste({ message: `Ouvrage créé, ${ids.length} ligne rattachée`, n: ids.length });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
