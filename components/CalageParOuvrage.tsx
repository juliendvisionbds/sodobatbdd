"use client";

// =====================================================================
// Calage « par ouvrage » : un panneau par ouvrage avec toutes ses lignes
// en attente. « Tout valider » quand la proposition est bonne pour
// toutes, cases à cocher pour une partie, « Changer d'ouvrage » ligne
// par ligne. Z annule le dernier geste.
// =====================================================================

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  annulerDerniereActionAction,
  validerOuvrageAction,
  validerRattachementAction,
  validerRattachementsAction,
} from "@/lib/actions/calage";
import {
  date as fmtDate,
  nombre,
  LIBELLES_UNITES,
  type FiltresCalage,
  type GroupeCalage,
  type LigneCalage,
  type Page,
} from "@/lib/types";
import { BadgeStatutDocument } from "./BadgeStatutDocument";
import { BandeauAction, type DernierGeste } from "./BandeauAction";
import { ComboboxOuvrage } from "./ComboboxOuvrage";
import { Pagination } from "./Pagination";

function libelleMethode(l: LigneCalage): string {
  if (l.methode === "regle") return "règle";
  if (l.methode === "llm") return "IA";
  if (l.methode === "manuel") return "manuel";
  return l.methode ?? "—";
}

export function CalageParOuvrage({
  page,
  filtres,
}: {
  page: Page<GroupeCalage>;
  filtres: FiltresCalage;
}) {
  const router = useRouter();
  const [groupes, setGroupes] = useState(page.lignes);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [geste, setGeste] = useState<DernierGeste | null>(null);
  const [changement, setChangement] = useState<{ ligne: LigneCalage; ouvrageId: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  // resynchronisation quand le serveur renvoie une nouvelle page
  const [pageRef, setPageRef] = useState(page);
  if (pageRef !== page) {
    setPageRef(page);
    setGroupes(page.lignes);
    setSelection(new Set());
  }

  const retirerLignes = (ouvrageId: string, ids: string[]) => {
    const retire = new Set(ids);
    setGroupes((gs) =>
      gs
        .map((g) =>
          g.ouvrage.id === ouvrageId
            ? {
                ...g,
                lignes: g.lignes.filter((l) => !retire.has(l.rattachementId ?? "")),
                nbEnAttente: g.nbEnAttente - ids.length,
              }
            : g,
        )
        .filter((g) => g.nbEnAttente > 0),
    );
    setSelection((s) => {
      const n = new Set(s);
      ids.forEach((id) => n.delete(id));
      return n;
    });
  };

  const toutValider = (g: GroupeCalage) => {
    demarrer(async () => {
      const ids = await validerOuvrageAction(g.ouvrage.id, filtres);
      setGroupes((gs) => gs.filter((x) => x.ouvrage.id !== g.ouvrage.id));
      setGeste({
        message: `${ids.length} ligne${ids.length > 1 ? "s" : ""} validée${ids.length > 1 ? "s" : ""} vers « ${g.ouvrage.libelleDevis} »`,
        n: ids.length,
      });
      router.refresh();
    });
  };

  const validerSelection = (g: GroupeCalage) => {
    const ids = g.lignes
      .map((l) => l.rattachementId)
      .filter((id): id is string => Boolean(id) && selection.has(id!));
    if (ids.length === 0) return;
    demarrer(async () => {
      const valides = await validerRattachementsAction(ids);
      retirerLignes(g.ouvrage.id, valides);
      setGeste({
        message: `${valides.length} ligne${valides.length > 1 ? "s" : ""} validée${valides.length > 1 ? "s" : ""} vers « ${g.ouvrage.libelleDevis} »`,
        n: valides.length,
      });
      router.refresh();
    });
  };

  const changerOuvrage = (ouvrageId: string, libelle: string) => {
    const c = changement;
    if (!c?.ligne.rattachementId) return;
    setChangement(null);
    demarrer(async () => {
      await validerRattachementAction(c.ligne.rattachementId!, ouvrageId);
      retirerLignes(c.ouvrageId, [c.ligne.rattachementId!]);
      setGeste({ message: `1 ligne rattachée à « ${libelle} »`, n: 1 });
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

  const basculer = (id: string) =>
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toutCocher = (g: GroupeCalage, coche: boolean) =>
    setSelection((s) => {
      const n = new Set(s);
      for (const l of g.lignes) {
        if (!l.rattachementId) continue;
        if (coche) n.add(l.rattachementId);
        else n.delete(l.rattachementId);
      }
      return n;
    });

  return (
    <div>
      <BandeauAction geste={geste} enCours={enCours} annuler={annuler} effacer={() => setGeste(null)} />

      {groupes.length === 0 ? (
        <p className="vx-panel py-16 text-center text-[15px] text-sub">
          Aucune proposition en attente pour ces critères.
        </p>
      ) : (
        <div className="flex flex-col gap-[22px]">
          {groupes.map((g) => {
            const nbCoches = g.lignes.filter((l) => l.rattachementId && selection.has(l.rattachementId)).length;
            const tousCoches = g.lignes.length > 0 && nbCoches === g.lignes.length;
            return (
              <article key={g.ouvrage.id} className="vx-panel !p-0">
                <header className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-line px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="mono text-[12.5px] text-sub">{g.ouvrage.lotCode ?? "—"}</span>
                      <h2 className="text-[16px] font-semibold leading-snug">{g.ouvrage.libelleDevis}</h2>
                      <span className="text-[12.5px] text-sub">
                        {g.ouvrage.unite ? LIBELLES_UNITES[g.ouvrage.unite] : "unité ?"}
                        {g.ouvrage.code ? ` · ${g.ouvrage.code}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[12.5px] text-faint" title={g.echantillon.join(" · ")}>
                      ex. : {g.echantillon.map((e) => `« ${e} »`).join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge b-navy">{g.nbEnAttente} en attente</span>
                    <span className="text-[12.5px] text-sub">
                      {g.nbValidees} validée{g.nbValidees > 1 ? "s" : ""}
                      {g.nbAuto > 0 ? ` (${g.nbAuto} auto)` : ""}
                    </span>
                    <button
                      type="button"
                      disabled={enCours || nbCoches === 0}
                      onClick={() => validerSelection(g)}
                      className="vx-btn-outline disabled:opacity-40"
                    >
                      Valider la sélection ({nbCoches})
                    </button>
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => toutValider(g)}
                      className="vx-btn !px-4 !py-2 !text-[14px]"
                    >
                      Tout valider ({g.nbEnAttente})
                    </button>
                  </div>
                </header>

                <div className="overflow-x-auto">
                  <table className="vx-tbl">
                    <thead>
                      <tr>
                        <th className="!w-8">
                          <input
                            type="checkbox"
                            aria-label="Tout cocher"
                            checked={tousCoches}
                            onChange={(e) => toutCocher(g, e.target.checked)}
                            className="accent-[var(--navy)]"
                          />
                        </th>
                        <th>Désignation (verbatim)</th>
                        <th>Pièce</th>
                        <th className="vx-r">Qté</th>
                        <th className="vx-r">PU HT</th>
                        <th className="vx-r">Score</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lignes.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label="Sélectionner la ligne"
                              checked={Boolean(l.rattachementId && selection.has(l.rattachementId))}
                              onChange={() => l.rattachementId && basculer(l.rattachementId)}
                              className="accent-[var(--navy)]"
                            />
                          </td>
                          <td className="max-w-[440px]">
                            <span className="line-clamp-2 text-[13.5px] leading-snug" title={l.designationBrute}>
                              {l.designationBrute}
                            </span>
                            <span className="text-[12px] text-faint">
                              {l.unite ? LIBELLES_UNITES[l.unite] : (l.uniteBrute ?? "—")}
                              {l.unite && g.ouvrage.unite && l.unite !== g.ouvrage.unite && (
                                <span className="badge b-amber ml-1.5" title="L'unité de la ligne diffère de celle de l'ouvrage">
                                  unité ≠
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-[12.5px] text-sub">
                            {l.numeroDocument ?? "—"} · {fmtDate(l.date)}
                            {l.client && <span className="block truncate max-w-[180px]" title={l.client}>{l.client}</span>}
                            <BadgeStatutDocument statut={l.statutDocument} controleLigne={l.controleLigne} className="mt-0.5" />
                            {l.estTs && <span className="badge b-amber mt-0.5">TS</span>}
                          </td>
                          <td className="vx-cell-amount">{nombre(l.quantite)}</td>
                          <td className="vx-cell-amount">{nombre(l.pu)}</td>
                          <td className="vx-cell-amount">
                            <span className="mono text-[12.5px]">{l.score == null ? "—" : nombre(l.score, 2)}</span>
                            <span className="badge b-neutre ml-1.5">{libelleMethode(l)}</span>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <button
                              type="button"
                              disabled={enCours}
                              onClick={() => setChangement({ ligne: l, ouvrageId: g.ouvrage.id })}
                              className="vx-btn-ghost"
                            >
                              Changer d&apos;ouvrage
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {g.lignesTronquees && (
                  <p className="border-t border-hairline px-6 py-3 text-[12.5px] text-faint">
                    Seules les {g.lignes.length} premières lignes sont affichées. « Tout valider » porte sur les {g.nbEnAttente}.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Pagination page={page.page} total={page.total} parPage={page.parPage} />

      {changement && (
        <ComboboxOuvrage
          titre="Changer l'ouvrage de cette ligne"
          contexte={<>« {changement.ligne.designationBrute} »</>}
          fermer={() => setChangement(null)}
          choisir={(o) => changerOuvrage(o.id, o.libelleDevis)}
        />
      )}
    </div>
  );
}
