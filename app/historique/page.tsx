// =====================================================================
// /historique — toutes les lignes, brutes, verbatim. Aucune moyenne.
// Deux modes : par document (défaut) et par ligne.
// =====================================================================

import { Suspense } from "react";
import { historique, referentiel } from "@/lib/queries";
import { date as fmtDate } from "@/lib/types";
import {
  lireFiltresHistorique,
  lirePage,
  nbFiltresHistoriqueActifs,
  type ParamsRecherche,
} from "@/lib/filtres-url";
import { EnTete } from "@/components/EnTete";
import { BarreRecherche } from "@/components/BarreRecherche";
import { FiltresHistorique } from "@/components/FiltresHistorique";
import { CarteDocument } from "@/components/CarteDocument";
import { lireSession } from "@/lib/session-serveur";
import { TableLignesHistorique } from "@/components/TableLignesHistorique";
import { Pagination } from "@/components/Pagination";
import {
  Kpi,
  Panneau,
  RangeeKpi,
  TitrePage,
  entier,
} from "@/components/Vision";

export const dynamic = "force-dynamic";

function hrefAvec(
  params: ParamsRecherche,
  changements: Record<string, string | null>,
): string {
  const suivants = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(params)) {
    const v = Array.isArray(valeur) ? valeur[0] : valeur;
    if (v) suivants.set(cle, v);
  }
  for (const [cle, valeur] of Object.entries(changements)) {
    if (valeur === null) suivants.delete(cle);
    else suivants.set(cle, valeur);
  }
  const chaine = suivants.toString();
  return chaine ? `/historique?${chaine}` : "/historique";
}

export default async function PageHistorique({
  searchParams,
}: {
  searchParams: Promise<ParamsRecherche>;
}) {
  const params = await searchParams;
  const filtres = lireFiltresHistorique(params);
  const page = lirePage(params);
  const mode = params.mode === "lignes" ? "lignes" : "documents";
  const docOuvert = typeof params.doc === "string" ? params.doc : null;
  const indexe = false;
  const [synthese, session] = await Promise.all([referentiel.synthese(), lireSession()]);
  const peutModifier = session?.estAdmin ?? false;

  return (
    <div className="min-h-screen">
      <EnTete actif="historique" synthese={synthese} />

      <main className="vx-wrap pb-16 pt-[30px]">
        <TitrePage
          titre="Chaque chantier, ligne par ligne."
          chapo="Tous les devis, factures, situations et avenants, tels qu'imprimés. Ici, aucune moyenne : les lignes brutes, verbatim, pour retrouver ce qui a été chiffré, à qui et quand."
        />

        <RangeeKpi
          enfants={
            <>
              <Kpi
                libelle="Pièces archivées"
                valeur={entier(synthese.nbDocuments)}
                sous="devis, factures, situations, avenants"
              />
              <Kpi
                libelle="Lignes chiffrées"
                valeur={entier(synthese.nbLignes)}
                sous="désignations conservées verbatim"
              />
              <Kpi
                libelle="Clients"
                valeur={entier(synthese.nbClients)}
                sous="rattachés à au moins une pièce"
              />
              <Kpi
                libelle="Période couverte"
                valeur={
                  synthese.premiereDate && synthese.derniereDate
                    ? `${synthese.premiereDate.slice(0, 4)} → ${synthese.derniereDate.slice(0, 4)}`
                    : "—"
                }
                sous={
                  synthese.premiereDate && synthese.derniereDate
                    ? `${fmtDate(synthese.premiereDate)} → ${fmtDate(synthese.derniereDate)}`
                    : undefined
                }
              />
            </>
          }
        />

        <Panneau
          titre={
            mode === "documents"
              ? "Pièces, document par document"
              : "Toutes les lignes"
          }
          meta={
            mode === "documents"
              ? "cliquez sur une pièce pour voir ses lignes"
              : indexe
                ? "prix unitaires actualisés"
                : "prix unitaires tels qu'imprimés"
          }
          enfants={
            <>
              <Suspense>
                <div className="flex flex-wrap items-center gap-2.5 border-b border-hairline pb-4">
                  <BarreRecherche placeholder="Rechercher un client, un chantier, un ouvrage…" />
                  <FiltresHistorique
                    nbActifs={nbFiltresHistoriqueActifs(filtres)}
                  />
                </div>
              </Suspense>
              {mode === "documents" ? (
                <ModeDocuments
                  filtres={filtres}
                  page={page}
                  docOuvert={docOuvert}
                  peutModifier={peutModifier}
                  params={params}
                />
              ) : (
                <ModeLignes filtres={filtres} page={page} indexe={indexe} />
              )}
            </>
          }
        />
      </main>
    </div>
  );
}

async function ModeDocuments({
  peutModifier,
  filtres,
  page,
  docOuvert,
  params,
}: {
  filtres: ReturnType<typeof lireFiltresHistorique>;
  page: number;
  docOuvert: string | null;
  peutModifier: boolean;
  params: ParamsRecherche;
}) {
  const [docs, detail] = await Promise.all([
    historique.listerDocuments(filtres, page),
    docOuvert ? historique.obtenirDocument(docOuvert) : Promise.resolve(null),
  ]);

  if (docs.total === 0) {
    return (
      <p className="py-20 text-center text-[15px] text-sub">
        Aucun document ne correspond à ces critères.
      </p>
    );
  }

  return (
    <>
      <p className="vx-panel__meta pb-1 pt-3" aria-live="polite">
        {entier(docs.total)} document{docs.total > 1 ? "s" : ""}
      </p>
      <div>
        {docs.lignes.map((d) => (
          <CarteDocument
            key={d.id}
            doc={d}
            detail={d.id === docOuvert ? detail : null}
            peutModifier={peutModifier}
            hrefBascule={hrefAvec(params, {
              doc: d.id === docOuvert ? null : d.id,
            })}
          />
        ))}
      </div>
      <Suspense>
        <Pagination
          page={docs.page}
          total={docs.total}
          parPage={docs.parPage}
        />
      </Suspense>
    </>
  );
}

async function ModeLignes({
  filtres,
  page,
  indexe,
}: {
  filtres: ReturnType<typeof lireFiltresHistorique>;
  page: number;
  indexe: boolean;
}) {
  const lignes = await historique.listerLignes(filtres, page);

  if (lignes.total === 0) {
    return (
      <p className="py-20 text-center text-[15px] text-sub">
        Aucune ligne ne correspond à ces critères.
      </p>
    );
  }

  return (
    <>
      <p className="vx-panel__meta pb-3 pt-3" aria-live="polite">
        {entier(lignes.total)} ligne{lignes.total > 1 ? "s" : ""}
      </p>
      <TableLignesHistorique lignes={lignes.lignes} indexe={indexe} />
      <Suspense>
        <Pagination
          page={lignes.page}
          total={lignes.total}
          parPage={lignes.parPage}
        />
      </Suspense>
    </>
  );
}
