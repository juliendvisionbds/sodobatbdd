// =====================================================================
// /frais — Frais de chantier : les ouvrages forfaitaires (installation,
// étude béton, amenée-repli, compte prorata…), suivis en part du montant
// de chantier plutôt qu'en prix unitaire. Données : mv_forfaits_ouvrage.
// =====================================================================

import { Suspense } from "react";
import { ouvrages, referentiel } from "@/lib/queries";
import { EnTete } from "@/components/EnTete";
import { FicheOuvrage } from "@/components/FicheOuvrage";
import { TableauFrais } from "@/components/TableauFrais";
import { Kpi, Panneau, RangeeKpi, TitrePage, entier } from "@/components/Vision";
import type { ParamsRecherche } from "@/lib/filtres-url";

export const dynamic = "force-dynamic";

export default async function PageFrais({
  searchParams,
}: {
  searchParams: Promise<ParamsRecherche>;
}) {
  const params = await searchParams;
  const ouvrageOuvert = typeof params.ouvrage === "string" ? params.ouvrage : undefined;
  const [lignes, synthese] = await Promise.all([
    ouvrages.listerFrais(),
    referentiel.synthese(),
  ]);
  const avecDonnees = lignes.filter((l) => l.normaux || l.ts);
  const chantiers = new Set(lignes.flatMap((l) => [l.normaux?.n ?? 0]));
  void chantiers;

  return (
    <div className="min-h-screen">
      <EnTete actif="frais" synthese={synthese} />

      <main className="vx-wrap pb-16 pt-[30px]">
        <TitrePage
          titre="Ce que coûte un chantier avant le premier m³."
          chapo="Installation, base vie, études, amenée et repli, compte prorata : ces lignes n'ont pas de prix unitaire. Elles sont suivies en part du montant du chantier, sur les devis validés."
        />

        <RangeeKpi
          enfants={
            <>
              <Kpi
                libelle="Postes de frais suivis"
                valeur={entier(avecDonnees.length)}
                sous={`sur ${entier(lignes.length)} ouvrages forfaitaires référencés`}
              />
              <Kpi
                libelle="Lecture"
                valeur="% du chantier"
                sous="médiane de la part de chaque poste dans le total HT de la pièce"
              />
            </>
          }
        />

        <Panneau
          titre="Frais de chantier"
          meta={`${entier(avecDonnees.length)} poste${avecDonnees.length > 1 ? "s" : ""} avec des données`}
          enfants={
            <Suspense>
              <TableauFrais lignes={lignes} />
            </Suspense>
          }
        />
      </main>

      {ouvrageOuvert && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <div className="hidden flex-1 bg-[rgba(30,34,38,.14)] sm:block" aria-hidden />
          <aside role="dialog" aria-label="Fiche ouvrage" className="panneau-lateral h-full w-full max-w-[620px] border-l border-line bg-surface">
            <Suspense fallback={<div className="p-6 text-[13.5px] text-sub">Chargement…</div>}>
              <FicheOuvrage
                id={ouvrageOuvert}
                filtres={{}}
                idsPage={lignes.map((l) => l.ouvrage.id)}
                totalListe={lignes.length}
                positionListe={null}
              />
            </Suspense>
          </aside>
        </div>
      )}
    </div>
  );
}
