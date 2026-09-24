"use client";

// =====================================================================
// Contenu de la fiche ouvrage — panneau latéral 620px.
// Règle absolue : aucun nombre orphelin. Tout prix affiché ici est
// traçable en deux clics jusqu'aux lignes qui le produisent.
// =====================================================================

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useParamsUrl } from "./useParamsUrl";
import { ReglettePrix, echelleCommune } from "./ReglettePrix";
import { GrapheEvolution, GrapheQuantite } from "./Graphes";
import { exclureLigneAction, reintegrerLigneAction } from "@/lib/actions/fiche";
import {
  euro,
  date as fmtDate,
  nombre,
  valeurs,
  LIBELLES_UNITES,
  LIBELLES_FIABILITE,
  type Cooccurrence,
  type LigneSourceContexte,
  type Ouvrage,
  type PointQuantite,
  type SeuilQuantite,
  type StatsForfait,
  type StatsPrix,
  type StatsZone,
} from "@/lib/types";

export interface DonneesFiche {
  ouvrage: Ouvrage;
  normaux: StatsPrix | null;
  ts: StatsPrix | null;
  zones: StatsZone[];
  serie: PointQuantite[];
  effetQuantite: { points: PointQuantite[]; seuil: SeuilQuantite | null };
  cooccurrences: Cooccurrence[];
  lignes: LigneSourceContexte[];
  forfaits: StatsForfait[];
  indexe: boolean;
  /** administrateur : peut écarter / réintégrer une ligne */
  peutModifier?: boolean;
  /** navigation ↑/↓ : ids des ouvrages de la page courante */
  idsPage: string[];
  totalListe: number;
  positionListe: number | null;
}

function Section({ titre, enfants }: { titre: string; enfants: React.ReactNode }) {
  return (
    <section className="border-t border-hairline px-6 py-5">
      {titre && <h3 className="vx-table__group mb-3 !p-0">{titre}</h3>}
      {enfants}
    </section>
  );
}

export function FicheContenu(d: DonneesFiche) {
  const { modifier } = useParamsUrl();
  const router = useRouter();
  const [onglet, setOnglet] = useState<"normaux" | "ts">(
    d.normaux ? "normaux" : "ts",
  );
  const [lignesOuvertes, setLignesOuvertes] = useState(false);
  const [enCours, demarrer] = useTransition();

  const fermer = () => modifier({ ouvrage: null }, true);

  // Échap ferme, ↑/↓ naviguent d'un ouvrage à l'autre sans fermer
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName)) return;
      if (e.key === "Escape") fermer();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const i = d.idsPage.indexOf(d.ouvrage.id);
        if (i === -1) return;
        const suivant =
          e.key === "ArrowDown"
            ? d.idsPage[Math.min(i + 1, d.idsPage.length - 1)]
            : d.idsPage[Math.max(i - 1, 0)];
        if (suivant !== d.ouvrage.id) {
          e.preventDefault();
          modifier({ ouvrage: suivant }, true);
        }
      }
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.ouvrage.id, d.idsPage]);

  const actif = onglet === "ts" ? d.ts : d.normaux;
  const v = actif ? valeurs(actif, d.indexe) : null;
  const unite = d.ouvrage.unite ? LIBELLES_UNITES[d.ouvrage.unite] : "";
  const echelle = echelleCommune(d.normaux, d.ts, d.indexe);

  const deltaTs =
    d.normaux && d.ts
      ? Math.round(
          ((d.indexe ? d.ts.medianeIndexee : d.ts.mediane) /
            (d.indexe ? d.normaux.medianeIndexee : d.normaux.mediane) -
            1) *
            100,
        )
      : null;

  const docsZoneDeduite = new Set(
    d.lignes.filter((l) => !l.zoneFiable).map((l) => l.documentId),
  ).size;

  const dispersion =
    actif?.coefVariation != null ? Math.round(actif.coefVariation * 100) : null;

  const [exclusionEnCours, setExclusionEnCours] = useState<string | null>(null);
  const [motifExclusion, setMotifExclusion] = useState("");

  const exclure = (ligne: LigneSourceContexte) => {
    const motif = motifExclusion.trim() || "Écartée depuis la fiche";
    setExclusionEnCours(null);
    setMotifExclusion("");
    demarrer(async () => {
      await exclureLigneAction(ligne.id, motif);
      router.refresh();
    });
  };

  const reintegrer = (ligne: LigneSourceContexte) => {
    demarrer(async () => {
      await reintegrerLigneAction(ligne.id);
      router.refresh();
    });
  };

  const ecartTypeActif = actif?.ecartType ?? null;
  const medianeActive = v?.mediane ?? null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ---------- en-tête ---------- */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-3">
        <button
          type="button"
          onClick={fermer}
          aria-label="Fermer la fiche (Échap)"
          className="vx-btn-outline"
        >
          ✕ Fermer
        </button>
        {d.positionListe !== null && (
          <span className="mono text-[12px] text-faint">
            {d.positionListe} / {d.totalListe}{" "}
            <span className="font-sans text-[11.5px]">· ↑↓ pour naviguer</span>
          </span>
        )}
      </div>

      <div className="px-6 pb-5 pt-5">
        <div className="vx-table__group !p-0">
          {d.ouvrage.lotLibelle ?? "Sans lot"}
          {d.ouvrage.code ? ` · ${d.ouvrage.code}` : ""}
        </div>
        <h2 className="vx-panel__title mt-1.5 !text-[21px] leading-snug">
          {d.ouvrage.libelleDevis}
        </h2>

        {/* ---------- ① prix vedette + onglets ---------- */}
        {!d.ouvrage.estForfaitaire && (
          <div className="mt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                {v ? (
                  <>
                    <div className="vx-kpi__label">Prix médian</div>
                    <div
                      className="vx-kpi__value !mt-1"
                      style={{ color: onglet === "ts" ? "var(--ts)" : "var(--navy)" }}
                    >
                      {euro(v.mediane)}
                      <span className="ml-1.5 font-sans text-[14px] font-normal tracking-normal text-sub">
                        / {unite}
                      </span>
                    </div>
                    {actif && (
                      <div className="mono mt-2 text-[12px] text-faint">
                        n={actif.n} · {actif.nChantiers} chantier
                        {actif.nChantiers > 1 ? "s" : ""} ·{" "}
                        {actif.premiereOccurrence.slice(0, 4)}–
                        {actif.derniereOccurrence.slice(0, 4)}
                        {dispersion !== null && <> · dispersion ±{dispersion} %</>}
                        {" · "}
                        {LIBELLES_FIABILITE[actif.fiabilite]}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[15px] text-sub">
                    Aucune occurrence {onglet === "ts" ? "en TS" : "en travaux normaux"}.
                  </div>
                )}
              </div>
              <div
                role="tablist"
                aria-label="Type de travaux"
                className="vx-seg shrink-0"
              >
                <button
                  role="tab"
                  aria-selected={onglet === "normaux"}
                  aria-pressed={onglet === "normaux"}
                  onClick={() => setOnglet("normaux")}
                  disabled={!d.normaux}
                  className="vx-seg__opt"
                >
                  Travaux normaux
                </button>
                <button
                  role="tab"
                  aria-selected={onglet === "ts"}
                  aria-pressed={onglet === "ts"}
                  onClick={() => setOnglet("ts")}
                  disabled={!d.ts}
                  className="vx-seg__opt"
                  style={onglet === "ts" ? { color: "var(--ts)" } : undefined}
                >
                  TS
                </button>
              </div>
            </div>

            {/* ---------- ② réglette grand format ---------- */}
            {actif && actif.n > 0 && (
              <div className="mt-5">
                <ReglettePrix
                  stats={actif}
                  indexe={d.indexe}
                  variante="detaillee"
                  echelle={echelle}
                  ts={onglet === "ts"}
                />
              </div>
            )}

            {/* ---------- ③ delta TS ---------- */}
            {deltaTs !== null && d.ts && (
              <div className="vx-insight vx-insight--warn mt-4">
                <div className="vx-insight__kicker">Travaux supplémentaires</div>
                <div className="vx-insight__title">
                  <span className="mono">
                    {euro(d.indexe ? d.ts.medianeIndexee : d.ts.mediane)}
                  </span>{" "}
                  en TS, soit {deltaTs > 0 ? "+" : ""}
                  {deltaTs} % vs travaux normaux
                </div>
                <div className="vx-insight__body mono">n={d.ts.n}</div>
              </div>
            )}
          </div>
        )}

        {/* ---------- forfaitaire : % du chantier ---------- */}
        {d.ouvrage.estForfaitaire && (
          <div className="mt-4">
            {d.forfaits.length === 0 ? (
              <p className="text-[14px] text-sub">Aucune occurrence validée.</p>
            ) : (
              d.forfaits.map((f) => (
                <div key={String(f.estTs)} className="mb-3">
                  <div className="vx-kpi__value !mt-0 text-navy">
                    {nombre(f.pctMedianChantier, 1)} %
                    <span className="ml-1.5 font-sans text-[14px] font-normal tracking-normal text-sub">
                      du montant de chantier
                    </span>
                  </div>
                  <div className="mono mt-2 text-[12px] text-faint">
                    {f.estTs ? "TS · " : ""}n={f.n} · montant médian {euro(f.montantMedian)} ·
                    chantiers de {euro(f.chantierMin)} à {euro(f.chantierMax)}
                  </div>
                </div>
              ))
            )}
            <p className="mt-1 text-[12.5px] text-faint">
              Ligne de frais de chantier : suivie en % du montant, exclue des
              moyennes de prix unitaires.
            </p>
          </div>
        )}
      </div>

      {/* ---------- ④ par zone ---------- */}
      {!d.ouvrage.estForfaitaire && (
        <Section titre="Par zone" enfants={
          <>
            <table className="w-full text-[14px]">
              <tbody>
                {d.zones.map((z) => {
                  const vz = z.stats ? valeurs(z.stats, d.indexe) : null;
                  return (
                    <tr key={z.zone} className="border-b border-hairline last:border-0">
                      <td className="py-2 pr-2">{z.zoneLibelle}</td>
                      <td className="vx-cell-key py-2">
                        {vz ? euro(vz.mediane) : "—"}
                      </td>
                      <td className="mono py-2 pl-3 text-right text-[11.5px] text-faint">
                        n={z.stats?.n ?? 0}
                      </td>
                      <td className="mono py-2 pl-3 text-right text-[12px] font-medium text-sub">
                        {z.ecartGlobal !== null
                          ? `${z.ecartGlobal > 0 ? "+" : "−"}${nombre(Math.abs(z.ecartGlobal), 0)} %`
                          : ""}
                      </td>
                      <td className="py-2 pl-2 text-right text-[12px] text-faint">
                        {z.stats && z.insuffisant ? "trop peu d'occurrences" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {docsZoneDeduite > 0 && (
              <p className="mt-3 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--warning)" }}>
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--warning)]" />
                Zone déduite de l&apos;adresse client pour {docsZoneDeduite} document
                {docsZoneDeduite > 1 ? "s" : ""}.
              </p>
            )}
          </>
        } />
      )}

      {/* ---------- ⑤ évolution ---------- */}
      {d.serie.length > 1 && (
        <Section titre="Évolution dans le temps" enfants={
          <>
            <GrapheEvolution points={d.serie} indexe={d.indexe} />
            <p className="mt-1 text-[12px] text-faint">
              ● travaux normaux · ▲ travaux supplémentaires
            </p>
          </>
        } />
      )}

      {/* ---------- ⑥ effet quantité ---------- */}
      {d.effetQuantite.points.length > 2 && !d.ouvrage.estForfaitaire && (
        <Section titre="Effet quantité" enfants={
          <>
            <GrapheQuantite
              points={d.effetQuantite.points}
              indexe={d.indexe}
              unite={unite}
            />
            {d.effetQuantite.seuil && (
              <p className="mt-2 text-[14px]">
                Au-delà de{" "}
                <span className="mono">
                  {nombre(d.effetQuantite.seuil.seuil, 0)} {unite}
                </span>
                , le prix médian descend à{" "}
                <span className="mono font-medium text-navy">
                  {euro(d.effetQuantite.seuil.medianeAuDessus)}
                </span>{" "}
                <span className="mono text-[11.5px] text-faint">
                  (n={d.effetQuantite.seuil.nAuDessus})
                </span>
                .
              </p>
            )}
          </>
        } />
      )}

      {/* ---------- ⑦ souvent facturé avec ---------- */}
      {d.cooccurrences.length > 0 && (
        <Section titre="Souvent facturé avec" enfants={
          <ul>
            {d.cooccurrences.map((c) => (
              <li key={c.ouvrage.id} className="flex items-baseline justify-between gap-3 border-t border-hairline py-2 text-[14px] first:border-0 first:pt-0">
                <button
                  type="button"
                  onClick={() => modifier({ ouvrage: c.ouvrage.id }, true)}
                  className="truncate text-left font-medium text-navy underline-offset-2 hover:underline"
                >
                  {c.ouvrage.libelleDevis}
                </button>
                <span className="mono shrink-0 text-[12px] text-faint">
                  {Math.round(c.taux * 100)} % des chantiers
                  {c.ratioQuantite !== null &&
                    ` · ≈${nombre(c.ratioQuantite, c.ratioQuantite % 1 === 0 ? 0 : 1)} par ${unite}`}
                </span>
              </li>
            ))}
          </ul>
        } />
      )}

      {/* ---------- ⑧ lignes sources ---------- */}
      <Section titre="" enfants={
        <>
          <button
            type="button"
            onClick={() => setLignesOuvertes((o) => !o)}
            aria-expanded={lignesOuvertes}
            className="vx-table__group flex w-full items-center gap-2 !p-0 hover:text-navy-deep"
          >
            <span aria-hidden className="vx-chev inline-block" style={{ transform: lignesOuvertes ? "rotate(90deg)" : "none" }}>▸</span>
            {d.lignes.length} ligne{d.lignes.length > 1 ? "s" : ""} source
            {d.lignes.length > 1 ? "s" : ""}
          </button>
          {lignesOuvertes && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="cote-label pb-2 pr-2">Date</th>
                    <th className="cote-label pb-2 pr-2">Client</th>
                    <th className="cote-label pb-2 pr-2 text-right">Qté</th>
                    <th className="cote-label pb-2 pr-2 text-right">PU</th>
                    <th className="cote-label pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {d.lignes.map((l) => {
                    const pu = d.indexe ? l.puIndexe : l.pu;
                    const horsNorme =
                      medianeActive !== null &&
                      ecartTypeActif !== null &&
                      ecartTypeActif > 0 &&
                      pu !== null &&
                      Math.abs(pu - medianeActive) > 2 * ecartTypeActif;
                    return (
                      <Fragment key={l.id}>
                      <tr
                        className={`border-b border-hairline last:border-0 ${
                          l.excluAgregats ? "opacity-45" : ""
                        }`}
                      >
                        <td className="mono py-2 pr-2 whitespace-nowrap">
                          {fmtDate(l.date)}
                          {l.statutDocument === "a_revoir" && (
                            <span
                              className="badge b-amber ml-1.5 !px-1.5 !py-0 !text-[10.5px]"
                              title="Pièce à revoir : son total imprimé ne tombe pas juste. Cette ligne est cohérente et compte."
                            >
                              à revoir
                            </span>
                          )}
                        </td>
                        <td className="max-w-[130px] truncate py-2 pr-2" title={`${l.client ?? ""} — ${l.chantierObjet ?? ""}\n« ${l.designationBrute} »`}>
                          {l.client ?? "—"}
                          {l.estTs && (
                            <span className="badge b-amber ml-1.5 !px-1.5 !py-0 !text-[10.5px]">TS</span>
                          )}
                        </td>
                        <td className="mono py-2 pr-2 text-right whitespace-nowrap">
                          {nombre(l.quantite, 0)} {l.uniteBrute ?? ""}
                        </td>
                        <td className="mono py-2 pr-2 text-right whitespace-nowrap">
                          {euro(pu)}
                          {horsNorme && !l.excluAgregats && (
                            <span className="ml-1 text-[11px] font-sans font-semibold" style={{ color: "var(--negative)" }}
                              title="À plus de 2 écarts types de la médiane">
                              ↑ hors norme
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {l.lienPdf ? (
                            <a href={l.lienPdf} target="_blank" rel="noreferrer"
                              className="mr-2 text-[12px] font-semibold text-navy underline-offset-2 hover:underline">
                              Pièce
                            </a>
                          ) : (
                            <span className="mr-2 text-[11px] text-faint" title="Pièce d'origine non déposée">
                              —
                            </span>
                          )}
                          {!d.peutModifier ? null : l.excluAgregats ? (
                            <button
                              type="button"
                              disabled={enCours}
                              onClick={() => reintegrer(l)}
                              className="rounded-[6px] border border-line bg-surface px-2 py-0.5 text-[11.5px] font-semibold text-navy hover:border-navy hover:bg-navy-tint"
                              title={l.motifExclusion ?? "Réintégrer dans les statistiques"}
                            >
                              réintégrer
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={enCours}
                              onClick={() => {
                                setExclusionEnCours(exclusionEnCours === l.id ? null : l.id);
                                setMotifExclusion("");
                              }}
                              aria-label="Écarter cette ligne des statistiques"
                              className="rounded-[6px] border border-line bg-surface px-1.5 py-0.5 text-[12px] text-sub hover:border-red hover:bg-red-bg hover:text-red"
                              title="Écarter des statistiques (motif demandé)"
                            >
                              ⊘
                            </button>
                          )}
                        </td>
                      </tr>
                      {exclusionEnCours === l.id && (
                        <tr className="border-b border-hairline">
                          <td colSpan={5} className="py-2">
                            <form
                              className="flex flex-wrap items-center gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                exclure(l);
                              }}
                            >
                              <span className="text-[12.5px] text-sub">Écarter « {l.designationBrute.slice(0, 50)} » :</span>
                              <input
                                autoFocus
                                value={motifExclusion}
                                onChange={(e) => setMotifExclusion(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setExclusionEnCours(null);
                                }}
                                placeholder="Motif (ex. prix aberrant, TS mal étiqueté)"
                                aria-label="Motif d'exclusion"
                                className="vx-input flex-1 !min-w-[200px] !py-1.5 !text-[13px]"
                              />
                              <button type="submit" disabled={enCours} className="vx-btn-outline !py-1.5 !text-[12.5px]">
                                Écarter
                              </button>
                              <button type="button" onClick={() => setExclusionEnCours(null)} className="vx-btn-ghost">
                                Annuler
                              </button>
                            </form>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-[12px] text-faint">
                Désignations verbatim au survol. Écarter une ligne recalcule
                immédiatement les statistiques.
              </p>
            </div>
          )}
        </>
      } />
    </div>
  );
}
