// =====================================================================
// lib/queries/historique.ts — implémente RequetesHistorique.
// Aucune moyenne ici : toutes les lignes, brutes, verbatim.
// =====================================================================

import { sql } from "../db";
import type {
  Client,
  CodeZone,
  CodeUnite,
  DocumentDetail,
  DocumentResume,
  FiltresHistorique,
  LigneHistorique,
  LigneSource,
  Page,
  StatutDocument,
  TypeDocument,
  UUID,
} from "../types";
import { versLigneContexte } from "./ouvrages";

// ---------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------

function condDocuments(f: FiltresHistorique) {
  const terme = f.recherche?.trim();
  return sql`
    ${terme
      ? sql`and (
          f_unaccent(lower(coalesce(c.nom_normalise, ''))) like '%' || f_unaccent(lower(${terme})) || '%'
          or word_similarity(f_unaccent(lower(${terme})), f_unaccent(lower(coalesce(c.nom_normalise, '')))) > 0.3
          or f_unaccent(lower(coalesce(d.chantier_objet, ''))) like '%' || f_unaccent(lower(${terme})) || '%'
          or d.numero_document ilike ${"%" + terme + "%"}
          or exists (select 1 from clients_alias ca
                     where ca.client_id = d.client_id
                       and word_similarity(f_unaccent(lower(${terme})), f_unaccent(lower(ca.alias))) > 0.3)
        )`
      : sql``}
    ${f.clientId ? sql`and d.client_id = ${f.clientId}` : sql``}
    ${f.zones && f.zones.length > 0 ? sql`and z.code = any(${f.zones as string[]})` : sql``}
    ${f.types && f.types.length > 0 ? sql`and d.type_document = any(${f.types as string[]})` : sql``}
    ${f.typeTravaux === "normaux" ? sql`and d.est_ts = false` : sql``}
    ${f.typeTravaux === "ts" ? sql`and d.est_ts = true` : sql``}
    ${f.depuis ? sql`and d.date_document >= ${f.depuis}` : sql``}
    ${f.jusquA ? sql`and d.date_document <= ${f.jusquA}` : sql``}
    ${f.montantMin != null ? sql`and d.total_ht >= ${f.montantMin}` : sql``}
    ${f.montantMax != null ? sql`and d.total_ht <= ${f.montantMax}` : sql``}
  `;
}

function versDocumentResume(r: Record<string, unknown>): DocumentResume {
  return {
    id: r.id as UUID,
    numero: (r.numero_document as string) ?? null,
    date: r.date_document as string,
    type: r.type_document as TypeDocument,
    estTs: Boolean(r.est_ts),
    client: r.client_id
      ? { id: r.client_id as UUID, nom: r.client_nom as string }
      : null,
    chantierObjet: (r.chantier_objet as string) ?? null,
    chantierCommune: (r.chantier_commune as string) ?? null,
    zone: (r.zone_code as CodeZone) ?? null,
    zoneFiable: Boolean(r.zone_fiable),
    totalHt: r.total_ht === null ? null : Number(r.total_ht),
    nbLignes: Number(r.nb_lignes),
    statut: r.statut as StatutDocument,
    lienPdf: r.storage_path ? `/api/documents/${r.id as string}/fichier` : null,
  };
}

// ---------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------

export async function listerDocuments(
  f: FiltresHistorique,
  page: number,
): Promise<Page<DocumentResume>> {
  const parPage = 25;
  const lignes = await sql`
    select d.id, d.numero_document, d.date_document::text as date_document,
           d.type_document, d.est_ts, d.client_id,
           c.nom_normalise as client_nom, d.chantier_objet,
           d.chantier_commune, z.code as zone_code, d.zone_fiable,
           d.total_ht, d.statut, d.storage_path,
           (select count(*)::int from lignes_source l
             where l.document_id = d.id and l.est_titre = false) as nb_lignes,
           count(*) over ()::int as total_compte
    from documents d
    left join clients c on c.id = d.client_id
    left join zones z on z.id = d.zone_id
    where true
    ${condDocuments(f)}
    ${f.lotId || f.ouvrageId
      ? sql`and exists (
          select 1 from lignes_source l
          join rattachements r on r.ligne_source_id = l.id
          join ouvrages o on o.id = r.ouvrage_id
          where l.document_id = d.id
          ${f.ouvrageId ? sql`and o.id = ${f.ouvrageId}` : sql``}
          ${f.lotId ? sql`and o.lot_id = ${f.lotId}` : sql``}
        )`
      : sql``}
    order by d.date_document desc, d.numero_document desc
    limit ${parPage} offset ${(page - 1) * parPage}
  `;
  return {
    lignes: lignes.map(versDocumentResume),
    total: lignes.length > 0 ? Number(lignes[0].total_compte) : 0,
    page,
    parPage,
    totalApproche: false,
  };
}

export async function obtenirDocument(
  id: UUID,
): Promise<DocumentDetail | null> {
  const [d] = await sql`
    select d.id, d.numero_document, d.date_document::text as date_document,
           d.type_document, d.est_ts, d.client_id,
           c.nom_normalise as client_nom, d.chantier_objet,
           d.chantier_commune, z.code as zone_code, d.zone_fiable,
           d.total_ht, d.ecart_total, d.statut, d.storage_path,
           (select count(*)::int from lignes_source l
             where l.document_id = d.id and l.est_titre = false) as nb_lignes
    from documents d
    left join clients c on c.id = d.client_id
    left join zones z on z.id = d.zone_id
    where d.id = ${id}`;
  if (!d) return null;

  const lignes = await sql`
    select l.id, l.document_id, l.ordre, l.designation_brute, l.unite_brute,
           l.quantite, l.pu_ht, l.total_ht, l.unite_code, l.attributs,
           l.est_forfait, l.controle_ligne, l.ecart,
           coalesce(r.exclu_agregats, false) as exclu_agregats,
           r.motif_exclusion
    from lignes_source l
    left join rattachements r on r.ligne_source_id = l.id
    where l.document_id = ${id} and l.est_titre = false
    order by l.ordre`;

  const versLigne = (r: Record<string, unknown>): LigneSource => ({
    id: r.id as UUID,
    documentId: r.document_id as UUID,
    ordre: Number(r.ordre),
    designationBrute: r.designation_brute as string,
    uniteBrute: (r.unite_brute as string) ?? null,
    unite: (r.unite_code as CodeUnite) ?? null,
    quantite: r.quantite === null ? null : Number(r.quantite),
    pu: r.pu_ht === null ? null : Number(r.pu_ht),
    puIndexe: null,
    total: r.total_ht === null ? null : Number(r.total_ht),
    attributs:
      (r.attributs as Record<string, string | number | boolean | null>) ?? {},
    estForfait: Boolean(r.est_forfait),
    excluAgregats: Boolean(r.exclu_agregats),
    motifExclusion: (r.motif_exclusion as string) ?? null,
  });

  return {
    ...versDocumentResume(d),
    lignes: lignes.map(versLigne),
    ecartTotal: d.ecart_total === null ? null : Number(d.ecart_total),
  };
}

// ---------------------------------------------------------------------
// Lignes (mode plat)
// ---------------------------------------------------------------------

export async function listerLignes(
  f: FiltresHistorique,
  page: number,
): Promise<Page<LigneHistorique>> {
  const parPage = 50;
  const terme = f.recherche?.trim();
  const lignes = await sql`
    select l.id, l.document_id, l.ordre, l.designation_brute, l.unite_brute,
           l.quantite, l.pu_ht, l.total_ht, l.unite_code, l.attributs,
           l.est_forfait, coalesce(r.exclu_agregats, false) as exclu_agregats,
           r.motif_exclusion, r.valide as rattachement_valide,
           d.date_document::text as date_document, d.numero_document,
           c.nom_normalise as client_nom, d.chantier_objet,
           z.code as zone_code, d.zone_fiable, d.est_ts, d.storage_path,
           o.id as ouvrage_id, o.libelle_devis, lo.libelle as lot_libelle,
           round(l.pu_ht * (
             (select coefficient from index_prix order by mois desc limit 1)
             / coalesce(ip.coefficient, 1)), 4)::float as pu_indexe,
           count(*) over ()::int as total_compte
    from lignes_source l
    join documents d on d.id = l.document_id
    left join clients c on c.id = d.client_id
    left join zones z on z.id = d.zone_id
    left join rattachements r on r.ligne_source_id = l.id
    left join ouvrages o on o.id = r.ouvrage_id
    left join lots lo on lo.id = o.lot_id
    left join index_prix ip on ip.mois = date_trunc('month', d.date_document)::date
    where l.est_titre = false
    ${condDocuments({ ...f, recherche: undefined })}
    ${terme
      ? sql`and (
          f_unaccent(lower(coalesce(c.nom_normalise, ''))) like '%' || f_unaccent(lower(${terme})) || '%'
          or l.designation_recherche like '%' || f_unaccent(lower(${terme})) || '%'
          or word_similarity(f_unaccent(lower(${terme})), l.designation_recherche) > 0.35
          or f_unaccent(lower(coalesce(o.libelle_devis, ''))) like '%' || f_unaccent(lower(${terme})) || '%'
        )`
      : sql``}
    ${f.ouvrageId ? sql`and o.id = ${f.ouvrageId}` : sql``}
    ${f.lotId ? sql`and o.lot_id = ${f.lotId}` : sql``}
    order by d.date_document desc, d.numero_document desc, l.ordre
    limit ${parPage} offset ${(page - 1) * parPage}
  `;
  return {
    lignes: lignes.map((r) => ({
      ...versLigneContexte(r),
      ouvrage: r.ouvrage_id
        ? { id: r.ouvrage_id as UUID, libelleDevis: r.libelle_devis as string }
        : null,
      lot: (r.lot_libelle as string) ?? null,
      rattachementValide: Boolean(r.rattachement_valide),
    })),
    total: lignes.length > 0 ? Number(lignes[0].total_compte) : 0,
    page,
    parPage,
    totalApproche: false,
  };
}

// ---------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------

export async function chercherClient(
  requete: string,
  limite = 10,
): Promise<Client[]> {
  const terme = requete.trim();
  const lignes = await sql`
    select c.id, c.nom_normalise, c.type_client, c.commune, c.code_postal,
           count(d.id)::int as nb_documents,
           coalesce(sum(d.total_ht), 0)::float as total_cumule,
           greatest(
             word_similarity(f_unaccent(lower(${terme})), f_unaccent(lower(c.nom_normalise))),
             similarity(f_unaccent(lower(${terme})), f_unaccent(lower(c.nom_normalise)))
           ) as score
    from clients c
    left join documents d on d.client_id = c.id
    where f_unaccent(lower(c.nom_normalise)) like '%' || f_unaccent(lower(${terme})) || '%'
       or word_similarity(f_unaccent(lower(${terme})), f_unaccent(lower(c.nom_normalise))) > 0.3
       or similarity(f_unaccent(lower(${terme})), f_unaccent(lower(c.nom_normalise))) > 0.2
       or exists (select 1 from clients_alias ca
                  where ca.client_id = c.id
                    and word_similarity(f_unaccent(lower(${terme})), f_unaccent(lower(ca.alias))) > 0.3)
    group by c.id
    order by score desc, nb_documents desc
    limit ${limite}
  `;
  return lignes.map((r) => ({
    id: r.id as UUID,
    nom: r.nom_normalise as string,
    typeClient: (r.type_client as string) ?? null,
    commune: (r.commune as string) ?? null,
    codePostal: (r.code_postal as string) ?? null,
    nbDocuments: Number(r.nb_documents),
    totalCumule: Number(r.total_cumule),
  }));
}
