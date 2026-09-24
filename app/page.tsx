// =====================================================================
// / — Tableau des prix. L'écran principal : s'ouvre directement sur la
// table, curseur dans la recherche. Pas de page d'accueil.
// =====================================================================

import { Suspense } from "react";
import { ouvrages, referentiel } from "@/lib/queries";
import { LIBELLES_ZONES } from "@/lib/types";
import { lireFiltres, lirePage, lireTri, nbFiltresActifs, type ParamsRecherche } from "@/lib/filtres-url";
import { EnTete } from "@/components/EnTete";
import { BarreRecherche } from "@/components/BarreRecherche";
import { Filtres } from "@/components/Filtres";
import { RailLots } from "@/components/RailLots";
import { TableauPrix } from "@/components/TableauPrix";
import { FicheOuvrage } from "@/components/FicheOuvrage";
import { BoutonExport } from "@/components/BoutonExport";
import { Kpi, Panneau, RangeeKpi, TitrePage, entier, ilYa } from "@/components/Vision";
import { lireSession } from "@/lib/session-serveur";

export const dynamic = "force-dynamic";

export default async function PageTableau({
  searchParams,
}: {
  searchParams: Promise<ParamsRecherche>;
}) {
  const params = await searchParams;
  const filtres = lireFiltres(params);
  const tri = lireTri(params);
  const numeroPage = lirePage(params);
  const ouvrageOuvert =
    typeof params.ouvrage === "string" ? params.ouvrage : undefined;

  const [page, lots, synthese, session] = await Promise.all([
    ouvrages.listerOuvrages(filtres, tri, numeroPage),
    referentiel.arbreLots(),
    referentiel.synthese(),
    lireSession(),
  ]);
  const estAdmin = session?.estAdmin ?? false;
  const indexe = filtres.indexe !== false;

  const baseVide =
    page.total === 0 &&
    nbFiltresActifs(filtres) === 0 &&
    synthese.nbOuvragesAvecPrix === 0;

  const idsPage = page.lignes.map((r) => r.ouvrage.id);
  const positionListe = ouvrageOuvert
    ? (() => {
        const i = idsPage.indexOf(ouvrageOuvert);
        return i === -1 ? null : (page.page - 1) * page.parPage + i + 1;
      })()
    : null;

  return (
    <div className="min-h-screen">
      <EnTete actif="prix" synthese={synthese} bascule />

      <main className="vx-wrap pb-16 pt-[30px]">
        <TitrePage
          titre="Le prix juste, déjà calculé."
          chapo="Vos devis et factures deviennent une grille de prix unitaires, recalculée à chaque pièce déposée. Chaque prix est une médiane réelle, avec son nombre d'occurrences, pas une estimation de métreur."
        />

        <RangeeKpi
          enfants={
            <>
              <Kpi
                libelle="Ouvrages avec un prix"
                valeur={entier(synthese.nbOuvragesAvecPrix)}
                sous={`sur ${entier(synthese.nbOuvrages)} ouvrages référencés · recalculés à chaque pièce`}
              />
              <Kpi
                libelle="Lots"
                valeur={entier(synthese.nbLots)}
                sous="arborescence complète, sous-lots compris"
              />
              <Kpi
                libelle="Zones géographiques"
                valeur={entier(synthese.nbZones)}
                sous={Object.values(LIBELLES_ZONES).join(", ")}
              />
              <Kpi
                libelle="Pièces analysées"
                valeur={entier(synthese.nbDocuments)}
                sous={`${entier(synthese.nbLignes)} lignes · dernière ${ilYa(synthese.derniereEcriture)}`}
              />
            </>
          }
        />

        <Panneau
          titre="Grille des prix unitaires"
          meta={
            <span aria-live="polite">
              {/* compteur permanent, jamais masqué pendant le chargement */}
              {entier(page.total)} ouvrage{page.total > 1 ? "s" : ""} ·{" "}
              {indexe ? "prix actualisés" : "prix bruts"}
            </span>
          }
          actions={
            <Suspense>
              <BoutonExport />
            </Suspense>
          }
          enfants={
            <>
              <Suspense>
                <div className="flex flex-wrap items-center gap-2.5 border-b border-hairline pb-4">
                  <BarreRecherche />
                  <Filtres nbActifs={nbFiltresActifs(filtres)} />
                </div>
              </Suspense>

              <div className="flex">
                <Suspense>
                  <RailLots lots={lots} />
                </Suspense>
                <div className="min-w-0 flex-1 pt-3 lg:pl-5">
                  <Suspense>
                    <TableauPrix
                      page={page}
                      indexe={indexe}
                      tri={tri}
                      lots={lots}
                      baseVide={baseVide}
                      estAdmin={estAdmin}
                    />
                  </Suspense>
                </div>
              </div>
              <p className="mt-3 text-[12.5px] text-faint">
                Cliquez sur une ligne pour ouvrir la fiche : prix par zone,
                évolution, effet quantité et lignes sources. Montants en € HT.
                Chaque prix est une médiane de <span className="mono">n</span> lignes
                de devis : n ≥ 10 et dispersion faible = fiable, 4 à 9 = à confirmer,
                moins = peu de données. Les ouvrages sans aucune ligne sont masqués
                (filtre « Affichage »).
              </p>
            </>
          }
        />
      </main>

      {/* ---------- panneau latéral fiche ouvrage ---------- */}
      {ouvrageOuvert && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <div className="hidden flex-1 bg-[rgba(30,34,38,.14)] sm:block" aria-hidden />
          <aside
            role="dialog"
            aria-label="Fiche ouvrage"
            className="panneau-lateral h-full w-full max-w-[620px] border-l border-line bg-surface"
          >
            <Suspense
              fallback={
                <div className="p-6 text-[13.5px] text-sub">Chargement…</div>
              }
            >
              <FicheOuvrage
                id={ouvrageOuvert}
                filtres={filtres}
                idsPage={idsPage}
                totalListe={page.total}
                positionListe={positionListe}
              />
            </Suspense>
          </aside>
        </div>
      )}
    </div>
  );
}
