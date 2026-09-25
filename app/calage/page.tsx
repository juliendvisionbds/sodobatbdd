// =====================================================================
// /calage — back-office de rapprochement. Réservé aux administrateurs
// (imposé par le middleware). Six onglets : par ouvrage (défaut), ligne
// à ligne, documents à revoir, doublons, sans ouvrage, référentiel.
// =====================================================================

import { Suspense } from "react";
import Link from "next/link";
import { referentiel } from "@/lib/queries";
import { EnTete } from "@/components/EnTete";
import { CalageFile } from "@/components/CalageFile";
import { CalageFiltres } from "@/components/CalageFiltres";
import { CalageParOuvrage } from "@/components/CalageParOuvrage";
import { CalageDocuments } from "@/components/CalageDocuments";
import { CalageDoublons } from "@/components/CalageDoublons";
import { CalageSansOuvrage } from "@/components/CalageSansOuvrage";
import { CalageReferentiel } from "@/components/CalageReferentiel";
import { CalageHorsPerimetre } from "@/components/CalageHorsPerimetre";
import { CalageLots } from "@/components/CalageLots";
import { Kpi, RangeeKpi, TitrePage, entier } from "@/components/Vision";
import {
  lireFiltresCalage,
  lirePage,
  nbFiltresCalageActifs,
  type ParamsRecherche,
} from "@/lib/filtres-url";

export const dynamic = "force-dynamic";

const ONGLETS = [
  "ouvrages", "file", "documents", "doublons", "sans-ouvrage", "hors-perimetre", "lots", "referentiel",
] as const;
type Onglet = (typeof ONGLETS)[number];

export default async function PageCalage({
  searchParams,
}: {
  searchParams: Promise<ParamsRecherche>;
}) {
  const params = await searchParams;
  const onglet: Onglet = ONGLETS.includes(params.onglet as Onglet)
    ? (params.onglet as Onglet)
    : "ouvrages";
  const filtres = lireFiltresCalage(params);
  const page = lirePage(params);

  const [prog, lots] = await Promise.all([
    referentiel.progression(),
    referentiel.lotsAPlat(),
  ]);
  const pct =
    prog.lignesTotal > 0
      ? Math.round((prog.lignesValidees / prog.lignesTotal) * 100)
      : 0;

  const lien = (cle: Onglet, libelle: string, badge?: number, ton = "b-red") => {
    const q = new URLSearchParams();
    if (cle !== "ouvrages") q.set("onglet", cle);
    if (cle === "documents" && params.incomplets === "1") q.set("incomplets", "1");
    for (const k of ["lot", "methode", "doc", "q"] as const) {
      const v = typeof params[k] === "string" ? (params[k] as string) : "";
      if (v && ["ouvrages", "file", "sans-ouvrage"].includes(cle)) q.set(k, v);
    }
    const chaine = q.toString();
    return (
      <Link
        href={chaine ? `/calage?${chaine}` : "/calage"}
        className="vx-chip inline-flex items-center gap-2"
        aria-pressed={onglet === cle}
      >
        {libelle}
        {badge != null && badge > 0 && (
          <span className={`badge ${ton} !px-2 !py-0`}>{entier(badge)}</span>
        )}
      </Link>
    );
  };

  const avecFiltres = onglet === "ouvrages" || onglet === "file" || onglet === "sans-ouvrage";

  return (
    <div className="min-h-screen">
      <EnTete actif="calage" />

      <main className="vx-wrap pb-16 pt-[30px]">
        <TitrePage
          titre="Chaque ligne, rattachée au bon ouvrage."
          chapo="Validez par ouvrage quand la proposition est bonne pour toutes les lignes, ligne à ligne pour les cas ambigus. Z annule le dernier geste. Chaque validation alimente immédiatement les prix du tableau."
        />

        <RangeeKpi
          enfants={
            <>
              <div className="vx-kpi">
                <div className="vx-kpi__label">Progression du calage</div>
                <div className="vx-kpi__value">{pct}&nbsp;%</div>
                <div className="vx-progress !pb-0">
                  <div
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Lignes validées"
                    className="vx-progress__rail"
                  >
                    <div className="vx-progress__fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
              <Kpi
                libelle="Lignes validées"
                valeur={entier(prog.lignesValidees)}
                sous={`sur ${entier(prog.lignesTotal)} lignes chiffrées · ${entier(prog.rattachementsEnAttente)} en attente`}
              />
              <Kpi
                libelle="Pièces à compléter"
                valeur={entier(prog.piecesIncompletes)}
                sous={
                  prog.piecesIncompletes > 0
                    ? `sans date, zone ou client · ${entier(prog.documentsARevoir)} avec écart de total`
                    : `${entier(prog.documentsARevoir)} avec écart de total`
                }
                ton={prog.piecesIncompletes > 0 ? "neg" : "pos"}
              />
              <Kpi
                libelle="Validées automatiquement"
                valeur={entier(prog.valideesAuto)}
                sous="annulables depuis « Par ouvrage » (filtre Méthode)"
              />
            </>
          }
        />

        <nav className="vx-chips mb-4" aria-label="Sections du calage">
          {lien("ouvrages", "Par ouvrage", prog.rattachementsEnAttente, "b-navy")}
          {lien("file", "Ligne à ligne")}
          {lien("documents", "Documents à revoir", prog.documentsARevoir)}
          {lien("doublons", "Doublons", prog.doublonsProposes, "b-amber")}
          {lien("sans-ouvrage", "Sans ouvrage", prog.lignesSansOuvrage, "b-amber")}
          {lien("hors-perimetre", "Hors périmètre", prog.horsPerimetre, "b-neutre")}
          {lien("lots", "Lots", prog.lotsProposes, "b-amber")}
          {lien("referentiel", "Référentiel")}
        </nav>

        {avecFiltres && (
          <Suspense>
            <CalageFiltres
              lots={lots}
              nbActifs={nbFiltresCalageActifs(filtres)}
              sansMethode={onglet === "sans-ouvrage"}
              sansLot={onglet === "sans-ouvrage"}
            />
          </Suspense>
        )}

        <Suspense fallback={<p className="vx-panel py-16 text-center text-sub">Chargement…</p>}>
          {onglet === "ouvrages" && <OngletOuvrages filtres={filtres} page={page} />}
          {onglet === "file" && <OngletFile lots={lots} filtres={filtres} />}
          {onglet === "documents" && <OngletDocuments incomplets={params.incomplets === "1"} />}
          {onglet === "hors-perimetre" && <OngletHorsPerimetre page={page} />}
          {onglet === "lots" && <OngletLots />}
          {onglet === "doublons" && <OngletDoublons />}
          {onglet === "sans-ouvrage" && <OngletSansOuvrage filtres={filtres} page={page} lots={lots} />}
          {onglet === "referentiel" && <CalageReferentiel lots={lots} />}
        </Suspense>
      </main>
    </div>
  );
}

type Lots = Array<{ id: string; code: string; libelle: string }>;
type Filtres = ReturnType<typeof lireFiltresCalage>;

async function OngletOuvrages({ filtres, page }: { filtres: Filtres; page: number }) {
  const groupes = await referentiel.rattachementsParOuvrage(filtres, page);
  return <CalageParOuvrage page={groupes} filtres={filtres} />;
}

async function OngletFile({ lots, filtres }: { lots: Lots; filtres: Filtres }) {
  const page = await referentiel.rattachementsAValider(1, filtres);
  return <CalageFile lot={page.lignes} lots={lots} total={page.total} />;
}

async function OngletDocuments({ incomplets }: { incomplets: boolean }) {
  const docs = await referentiel.documentsARevoir({ incomplets });
  return <CalageDocuments docs={docs} incomplets={incomplets} />;
}

async function OngletHorsPerimetre({ page }: { page: number }) {
  const lignes = await referentiel.lignesHorsPerimetre(page);
  return <CalageHorsPerimetre page={lignes} />;
}

async function OngletLots() {
  const [arbre, proposes, versExistants] = await Promise.all([
    referentiel.arbreLots(),
    referentiel.listerLotsProposes(),
    referentiel.affectationsProposeesVersLotsExistants(),
  ]);
  return <CalageLots lots={arbre} proposes={proposes} versExistants={versExistants} />;
}

async function OngletDoublons() {
  const fusions = await referentiel.listerFusionsProposees("proposee");
  return <CalageDoublons fusions={fusions} />;
}

async function OngletSansOuvrage({
  filtres,
  page,
  lots,
}: {
  filtres: Filtres;
  page: number;
  lots: Lots;
}) {
  const lignes = await referentiel.lignesSansOuvrage(filtres, page);
  return <CalageSansOuvrage page={lignes} lots={lots} />;
}
