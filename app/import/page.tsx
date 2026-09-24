// =====================================================================
// /import — dépôt des devis (admin). Multi-fichiers, traitement
// séquentiel côté serveur, historique des imports avec relance.
// =====================================================================

import { sql } from "@/lib/db";
import { EnTete } from "@/components/EnTete";
import { ImportDepot } from "@/components/ImportDepot";
import { ImportRelance } from "@/components/ImportRelance";
import { date as fmtDate } from "@/lib/types";
import { Kpi, Panneau, RangeeKpi, TitrePage, entier, ilYa } from "@/components/Vision";

export const dynamic = "force-dynamic";
// Vercel : l'extraction d'une grosse pièce dépasse les 60 s par défaut.
// 300 s requiert un plan Pro ; sur Hobby, importer les gros fichiers en
// local (npm run import -- dossier/).
export const maxDuration = 300;

type LigneImport = {
  id: string;
  fichier_nom: string;
  statut: string;
  message_erreur: string | null;
  document_id: string | null;
  bilan: {
    nbLignes?: number;
    nbLignesEcart?: number;
    ouvragesCrees?: number;
    statutDocument?: string;
  } | null;
  created_at: string;
  updated_at: string;
};

/** Import resté en cours plus de 30 min : la fonction serveur s'est
 *  interrompue (délai, redéploiement). Reprise possible depuis Storage. */
function bloque(imp: LigneImport): boolean {
  return (
    ["en_attente", "extraction", "extrait"].includes(imp.statut) &&
    Date.now() - new Date(imp.updated_at).getTime() > 30 * 60 * 1000
  );
}

const BADGES: Record<string, { classe: string; libelle: string }> = {
  en_attente: { classe: "b-neutre", libelle: "en attente" },
  extraction: { classe: "b-amber", libelle: "extraction…" },
  extrait: { classe: "b-amber", libelle: "insertion…" },
  insere: { classe: "b-green", libelle: "inséré" },
  doublon: { classe: "b-neutre", libelle: "doublon" },
  erreur: { classe: "b-red", libelle: "échec" },
};

export default async function PageImport() {
  const imports = (await sql`
    select id, fichier_nom, statut, message_erreur, document_id, bilan,
           created_at, updated_at
    from imports
    order by created_at desc
    limit 200`) as unknown as LigneImport[];

  const [stats] = await sql`select
    count(*) filter (where statut = 'insere')::int as inseres,
    count(*) filter (where statut = 'erreur'
      or (statut in ('en_attente', 'extraction', 'extrait')
          and updated_at < now() - interval '30 minutes'))::int as erreurs,
    count(*) filter (where statut = 'doublon')::int as doublons,
    count(*)::int as total
    from imports`;

  return (
    <div className="min-h-screen">
      <EnTete actif="import" />

      <main className="vx-wrap pb-16 pt-[30px]">
        <TitrePage
          titre="Chaque pièce déposée, intégrée."
          chapo="Déposez les devis et factures : chaque fichier est archivé, lu par l'IA, contrôlé ligne à ligne puis inséré dans la base. Les prix du tableau se recalculent aussitôt."
        />

        <RangeeKpi
          enfants={
            <>
              <Kpi libelle="Fichiers déposés" valeur={entier(stats.total)} sous="depuis la mise en service" />
              <Kpi libelle="Insérés" valeur={entier(stats.inseres)} sous="intégrés à la base de prix" ton="pos" />
              <Kpi libelle="Doublons" valeur={entier(stats.doublons)} sous="déjà présents, ignorés" />
              <Kpi
                libelle="Échecs"
                valeur={entier(stats.erreurs)}
                sous={stats.erreurs > 0 ? "échecs et imports bloqués, à reprendre ci-dessous" : "aucun échec"}
                ton={stats.erreurs > 0 ? "neg" : undefined}
              />
            </>
          }
        />

        <Panneau
          titre="Déposer des pièces"
          meta="PDF, XLS, XLSX, ODS"
          className="mb-[22px]"
          enfants={<ImportDepot />}
        />

        <Panneau
          titre="Flux d'import"
          meta={`${entier(imports.length)} derniers fichiers`}
          enfants={
            imports.length === 0 ? (
              <p className="py-10 text-center text-[15px] text-sub">
                Aucun import pour le moment. Déposez les devis ci-dessus :
                chaque fichier est archivé, extrait, contrôlé puis inséré.
              </p>
            ) : (
              <ul className="border-t border-line">
                {imports.map((imp) => {
                  const estBloque = bloque(imp);
                  const badge = estBloque
                    ? { classe: "b-red", libelle: `bloqué ${ilYa(imp.updated_at)}` }
                    : (BADGES[imp.statut] ?? BADGES.en_attente);
                  return (
                    <li
                      key={imp.id}
                      className="flex flex-wrap items-center gap-3 border-b border-hairline px-1 py-2.5 text-[14px]"
                    >
                      <span className="max-w-[420px] truncate font-medium">
                        {imp.fichier_nom}
                      </span>
                      <span className="mono text-[12.5px] text-faint">
                        {fmtDate(imp.created_at)}
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        {imp.bilan?.nbLignes != null && (
                          <span className="mono text-[12.5px] text-sub">
                            {imp.bilan.nbLignes} lignes
                            {imp.bilan.nbLignesEcart
                              ? ` · ${imp.bilan.nbLignesEcart} écart(s)`
                              : ""}
                            {imp.bilan.statutDocument === "a_revoir"
                              ? " · à revoir"
                              : ""}
                          </span>
                        )}
                        <span className={`badge ${badge.classe}`}>
                          {badge.libelle}
                        </span>
                        {(imp.statut === "erreur" || estBloque) && (
                          <ImportRelance importId={imp.id} libelle={estBloque ? "Reprendre" : "Relancer"} />
                        )}
                      </span>
                      {imp.message_erreur && (
                        <p className="w-full text-[12.5px] text-red">
                          {imp.message_erreur}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          }
        />
      </main>
    </div>
  );
}
