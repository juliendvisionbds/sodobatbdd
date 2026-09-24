// =====================================================================
// Insertion en base d'un DocumentExtrait : rapprochement client,
// résolution de zone, normalisation des unités, statuts de contrôle.
// La couche SOURCE reste verbatim : aucune correction des désignations.
// =====================================================================

import { sql } from "@/lib/db";
import {
  controlerDocument,
  type DocumentExtrait,
} from "./schema";
import { MODELE_EXTRACTION } from "./appel-modele";
import { VERSION_EXTRACTION } from "./schema";

const SEUIL_CLIENT_TRIGRAMME = 0.55;

// Postgres refuse le caractère nul (\u0000) dans text et jsonb — présent
// dans certains vieux .xls. Nettoyage récursif avant insertion.
function sansCaracteresNuls<T>(valeur: T): T {
  if (typeof valeur === "string") {
    return valeur.replace(/\u0000/g, "") as T;
  }
  if (Array.isArray(valeur)) {
    return valeur.map(sansCaracteresNuls) as T;
  }
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(
      Object.entries(valeur).map(([k, v]) => [
        k.replace(/\u0000/g, ""),
        sansCaracteresNuls(v),
      ]),
    ) as T;
  }
  return valeur;
}

export type ResultatInsertion = {
  documentId: string;
  statut: "valide" | "a_revoir";
  nbLignes: number;
  nbLignesEcart: number;
  clientCree: boolean;
  zoneFiable: boolean;
};

// ---------------------------------------------------------------------
// Client : alias exact -> trigramme -> création
// ---------------------------------------------------------------------

async function rapprocherClient(
  extrait: DocumentExtrait,
): Promise<{ clientId: string | null; cree: boolean }> {
  const nom = extrait.client_nom?.trim();
  if (!nom) return { clientId: null, cree: false };

  const [parAlias] = await sql`
    select client_id from clients_alias where alias = ${nom}`;
  if (parAlias) return { clientId: parAlias.client_id as string, cree: false };

  const [parTrigramme] = await sql`
    select id, similarity(f_unaccent(lower(nom_normalise)),
                          f_unaccent(lower(${nom}))) as score
    from clients
    where similarity(f_unaccent(lower(nom_normalise)),
                     f_unaccent(lower(${nom}))) >= ${SEUIL_CLIENT_TRIGRAMME}
    order by score desc
    limit 1`;
  if (parTrigramme) {
    // Mémoriser la graphie pour les prochains imports.
    await sql`insert into clients_alias (alias, client_id)
      values (${nom}, ${parTrigramme.id}) on conflict do nothing`;
    return { clientId: parTrigramme.id as string, cree: false };
  }

  const [cree] = await sql`insert into clients
    (nom_normalise, code_postal, commune, adresse_vaut_chantier)
    values (${nom}, ${extrait.client_code_postal},
            ${extrait.client_commune}, false)
    returning id`;
  await sql`insert into clients_alias (alias, client_id)
    values (${nom}, ${cree.id}) on conflict do nothing`;
  return { clientId: cree.id as string, cree: true };
}

// ---------------------------------------------------------------------
// Zone : CP chantier explicite -> fiable ; sinon CP client -> déduite
// ---------------------------------------------------------------------

async function resoudreZone(
  codePostal: string | null,
): Promise<string | null> {
  if (!codePostal) return null;
  const cp = codePostal.trim();

  const [exacte] = await sql`
    select zone_id from zones_communes where code_postal = ${cp} limit 1`;
  if (exacte) return exacte.zone_id as string;

  // Repli départemental : 06 -> zone 06, 83 -> reste du Var.
  const departement = cp.slice(0, 2);
  const codeZone =
    departement === "06" ? "06" : departement === "83" ? "83_AUTRE" : null;
  if (!codeZone) return null;
  const [zone] = await sql`select id from zones where code = ${codeZone}`;
  return (zone?.id as string) ?? null;
}

// ---------------------------------------------------------------------
// Unités : alias exact puis insensible à la casse
// ---------------------------------------------------------------------

type AliasUnite = { alias: string; code_unite: string; facteur: number };
let cacheAlias: AliasUnite[] | null = null;

async function normaliserUnite(
  brute: string | null,
): Promise<{ code: string | null; facteur: number }> {
  if (!brute) return { code: null, facteur: 1 };
  if (!cacheAlias) {
    cacheAlias = (await sql`
      select alias, code_unite, facteur::float as facteur
      from unites_alias`) as unknown as AliasUnite[];
  }
  const nettoyee = brute.trim();
  const exact = cacheAlias.find((a) => a.alias === nettoyee);
  if (exact) return { code: exact.code_unite, facteur: exact.facteur };
  const insensible = cacheAlias.find(
    (a) => a.alias.toLowerCase() === nettoyee.toLowerCase(),
  );
  if (insensible) return { code: insensible.code_unite, facteur: insensible.facteur };
  return { code: null, facteur: 1 };
}

// ---------------------------------------------------------------------
// Insertion complète
// ---------------------------------------------------------------------

export async function insererDocument(params: {
  extrait: DocumentExtrait;
  brut: unknown;
  fichierNom: string;
  fichierHash: string;
  storagePath: string | null;
  nbPages: number | null;
}): Promise<ResultatInsertion> {
  const extrait = sansCaracteresNuls(params.extrait);
  const brut = sansCaracteresNuls(params.brut);
  const { fichierNom, fichierHash, storagePath, nbPages } = params;

  const [doublon] = await sql`
    select id from documents where fichier_hash = ${fichierHash}`;
  if (doublon) {
    throw new Error(`Doublon : ce fichier est déjà importé (document ${doublon.id}).`);
  }

  const controle = controlerDocument(extrait);
  const { clientId, cree: clientCree } = await rapprocherClient(extrait);

  // Zone : priorité au CP chantier explicite.
  let zoneId = await resoudreZone(extrait.chantier_code_postal);
  let zoneFiable = zoneId != null;
  if (!zoneId) {
    zoneId = await resoudreZone(extrait.client_code_postal);
    zoneFiable = false;
  }

  const confianceMoyenne =
    extrait.lignes.length > 0
      ? extrait.lignes.reduce((s, l) => s + l.confiance, 0) / extrait.lignes.length
      : null;

  const dateValide =
    extrait.date_document && /^\d{4}-\d{2}-\d{2}$/.test(extrait.date_document)
      ? extrait.date_document
      : null;

  const [doc] = await sql`insert into documents
    (fichier_nom, fichier_hash, storage_path, nb_pages,
     type_document, est_ts, numero_document, date_document,
     client_nom_brut, client_id, chantier_objet,
     chantier_code_postal, chantier_commune, zone_id, zone_fiable,
     total_ht, tva_taux, total_ttc,
     extraction_modele, extraction_version, extraction_confiance, raw_json,
     controle_total, ecart_total, statut)
    values
    (${fichierNom}, ${fichierHash}, ${storagePath}, ${nbPages},
     ${extrait.type_document}, ${extrait.est_ts},
     ${extrait.numero_document}, ${dateValide},
     ${extrait.client_nom}, ${clientId}, ${extrait.chantier_objet},
     ${extrait.chantier_code_postal}, ${extrait.chantier_commune},
     ${zoneId}, ${zoneFiable},
     ${extrait.total_ht}, ${extrait.tva_taux}, ${extrait.total_ttc},
     ${MODELE_EXTRACTION}, ${VERSION_EXTRACTION}, ${confianceMoyenne},
     ${sql.json(brut as never)},
     ${controle.controleTotal}, ${controle.ecartTotal}, ${controle.statut})
    returning id`;

  for (const { ligne, statut, ecart } of controle.lignes) {
    const { code: uniteCode, facteur } = await normaliserUnite(ligne.unite_brute);
    const quantiteNormalisee =
      ligne.quantite != null ? +(ligne.quantite * facteur).toFixed(3) : null;
    const estForfait = uniteCode === "forfait" || uniteCode === "ens";

    await sql`insert into lignes_source
      (document_id, page, ordre, designation_brute, unite_brute,
       quantite, pu_ht, total_ht,
       unite_code, quantite_normalisee, est_titre, est_forfait,
       attributs, controle_ligne, ecart, confiance)
      values
      (${doc.id}, ${ligne.page}, ${ligne.ordre}, ${ligne.designation},
       ${ligne.unite_brute}, ${ligne.quantite}, ${ligne.pu_ht}, ${ligne.total_ht},
       ${uniteCode}, ${quantiteNormalisee}, ${ligne.est_titre}, ${estForfait},
       ${sql.json(ligne.attributs as never)}, ${statut}, ${ecart},
       ${ligne.confiance})`;
  }

  return {
    documentId: doc.id as string,
    statut: controle.statut,
    nbLignes: extrait.lignes.length,
    nbLignesEcart: controle.lignesEnEcart,
    clientCree,
    zoneFiable,
  };
}
