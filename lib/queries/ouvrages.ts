// =====================================================================
// lib/queries/ouvrages.ts — implémente RequetesOuvrages (05_types).
// Server-only. Ces fonctions alimentent l'interface ET les outils du
// chat : un seul chemin vers la donnée.
// =====================================================================

import { sql } from "../db";
import {
  FILTRES_DEFAUT,
  type ColonneTriPrix,
  type Cooccurrence,
  type CodeUnite,
  type CodeZone,
  type ControleLigne,
  type Fiabilite,
  type FiltresPrix,
  type FraisResume,
  type LigneSourceContexte,
  type Ouvrage,
  type OuvrageResume,
  type Page,
  type PointQuantite,
  type SeuilQuantite,
  type StatsForfait,
  type StatsPrix,
  type StatsZone,
  type StatutDocument,
  type Tri,
  type UUID,
} from "../types";
import { LIBELLES_ZONES } from "../types";
import {
  COND_LIGNE_COMPTEE,
  SELECT_STATS,
  condFiltres,
  condTypeTravaux,
  versStatsPrix,
} from "./stats";

// ---------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------

function versOuvrage(r: Record<string, unknown>): Ouvrage {
  return {
    id: r.id as UUID,
    code: (r.code as string) ?? null,
    lotId: (r.lot_id as UUID) ?? null,
    lotCode: (r.lot_code as string) ?? null,
    lotLibelle: (r.lot_libelle as string) ?? null,
    libelleDevis: r.libelle_devis as string,
    libelleNormalise: r.libelle_normalise as string,
    descriptionLongue: (r.description_longue as string) ?? null,
    notesSpecifiques: (r.notes_specifiques as string) ?? null,
    unite: (r.unite_reference as CodeUnite) ?? null,
    estForfaitaire: Boolean(r.est_forfaitaire),
    actif: Boolean(r.actif),
  };
}

const SELECT_OUVRAGE = sql`
  o.id, o.code, o.lot_id, l.code as lot_code, l.libelle as lot_libelle,
  o.libelle_devis, o.libelle_normalise, o.description_longue,
  o.notes_specifiques, o.unite_reference, o.est_forfaitaire, o.actif
`;

async function idsLotAvecDescendants(
  lotId: UUID,
  inclureSousLots: boolean,
): Promise<UUID[]> {
  if (!inclureSousLots) return [lotId];
  const lignes = await sql`
    with recursive arbre as (
      select id from lots where id = ${lotId}
      union all
      select l.id from lots l join arbre a on l.parent_id = a.id
    )
    select id from arbre`;
  return lignes.map((r) => r.id as UUID);
}

/** Condition de recherche floue : libellés propres, normalisés ET
 *  désignations brutes rattachées (fautes comprises). */
function condRecherche(terme: string) {
  const motif = "%" + terme + "%";
  return sql`and (
    o.code ilike ${motif}
    or f_unaccent(lower(o.libelle_devis)) like '%' || f_unaccent(lower(${terme})) || '%'
    or f_unaccent(lower(o.libelle_normalise)) like '%' || f_unaccent(lower(${terme})) || '%'
    or word_similarity(f_unaccent(lower(${terme})), f_unaccent(lower(o.libelle_devis))) > 0.35
    or word_similarity(f_unaccent(lower(${terme})), o.libelle_normalise) > 0.35
    or exists (
      select 1
      from rattachements r
      join lignes_source ls on ls.id = r.ligne_source_id
      where r.ouvrage_id = o.id
        and (ls.designation_recherche like '%' || f_unaccent(lower(${terme})) || '%'
             or word_similarity(f_unaccent(lower(${terme})), ls.designation_recherche) > 0.4)
    )
  )`;
}

const ORDRE_FIABILITE: Record<Fiabilite, number> = {
  faible: 0,
  moyenne: 1,
  haute: 2,
};

// ---------------------------------------------------------------------
// listerOuvrages — la table principale
// ---------------------------------------------------------------------

export async function listerOuvrages(
  filtres: FiltresPrix,
  tri: Tri<ColonneTriPrix>,
  page: number,
  parPage = 50,
): Promise<Page<OuvrageResume>> {
  const f = { ...FILTRES_DEFAUT, ...filtres };
  const terme = f.recherche?.trim();

  const lotIds = f.lotId
    ? await idsLotAvecDescendants(f.lotId, f.inclureSousLots)
    : null;

  const ouvrages = await sql`
    select ${SELECT_OUVRAGE}
    from ouvrages o
    left join lots l on l.id = o.lot_id
    where o.actif = true
    ${f.inclureForfaits ? sql`` : sql`and o.est_forfaitaire = false`}
    ${lotIds ? sql`and o.lot_id = any(${lotIds})` : sql``}
    ${f.unites && f.unites.length > 0 ? sql`and o.unite_reference = any(${f.unites as string[]})` : sql``}
    ${terme ? condRecherche(terme) : sql``}
  `;
  if (ouvrages.length === 0) {
    return { lignes: [], total: 0, page, parPage, totalApproche: false };
  }

  const ids = ouvrages.map((o) => o.id as UUID);
  const statsLignes = await sql`
    select v.ouvrage_id, v.est_ts, ${SELECT_STATS}
    from v_lignes_agregables v
    left join zones z on z.id = v.zone_id
    where v.ouvrage_id = any(${ids})
    ${condFiltres(f)}
    group by v.ouvrage_id, v.est_ts
  `;

  const parOuvrage = new Map<UUID, { normaux?: StatsPrix; ts?: StatsPrix }>();
  for (const r of statsLignes) {
    const id = r.ouvrage_id as UUID;
    const estTs = Boolean(r.est_ts);
    const stats = versStatsPrix(r, {
      ouvrageId: id,
      niveau: "type",
      estTs,
      zone: null,
    });
    if (!stats) continue;
    const entree = parOuvrage.get(id) ?? {};
    if (estTs) entree.ts = stats;
    else entree.normaux = stats;
    parOuvrage.set(id, entree);
  }

  let resumes: OuvrageResume[] = ouvrages.map((o) => {
    const s = parOuvrage.get(o.id as UUID) ?? {};
    const normaux = s.normaux ?? null;
    const ts = s.ts ?? null;
    const deltaTs =
      normaux && ts && normaux.medianeIndexee > 0
        ? Math.round(
            ((f.indexe ? ts.medianeIndexee : ts.mediane) /
              (f.indexe ? normaux.medianeIndexee : normaux.mediane) -
              1) *
              1000,
          ) / 10
        : null;
    return { ouvrage: versOuvrage(o), normaux, ts, deltaTs };
  });

  // filtres post-agrégation
  if (!f.inclureSansPrix) {
    resumes = resumes.filter((r) => r.normaux !== null || r.ts !== null);
  }
  if (f.typeTravaux === "normaux") {
    resumes = resumes.filter((r) => r.normaux !== null);
  } else if (f.typeTravaux === "ts") {
    resumes = resumes.filter((r) => r.ts !== null);
  }
  const filtrePerimetre =
    (f.zones && f.zones.length > 0) || f.depuis || f.jusquA;
  if (filtrePerimetre) {
    resumes = resumes.filter((r) => r.normaux !== null || r.ts !== null);
  }
  if (f.nMinimum && f.nMinimum > 0) {
    resumes = resumes.filter(
      (r) => Math.max(r.normaux?.n ?? 0, r.ts?.n ?? 0) >= f.nMinimum!,
    );
  }
  if (f.fiabiliteMinimum) {
    const seuil = ORDRE_FIABILITE[f.fiabiliteMinimum];
    resumes = resumes.filter((r) => {
      const meilleure = Math.max(
        r.normaux ? ORDRE_FIABILITE[r.normaux.fiabilite] : -1,
        r.ts ? ORDRE_FIABILITE[r.ts.fiabilite] : -1,
      );
      return meilleure >= seuil;
    });
  }

  // tri
  const sens = tri.sens === "asc" ? 1 : -1;
  const prix = (s: StatsPrix | null) =>
    s === null ? null : f.indexe ? s.medianeIndexee : s.mediane;
  const cle = (r: OuvrageResume): string | number | null => {
    switch (tri.colonne) {
      case "libelle": return r.ouvrage.libelleDevis.toLowerCase();
      case "lot": return r.ouvrage.lotCode ?? "";
      case "unite": return r.ouvrage.unite ?? "";
      // prix de référence : travaux normaux, repli sur TS
      case "prix": return prix(r.normaux ?? r.ts);
      case "n": return (r.normaux?.n ?? 0) + (r.ts?.n ?? 0);
      case "derniere_occurrence":
        return r.normaux || r.ts
          ? [r.normaux?.derniereOccurrence, r.ts?.derniereOccurrence]
              .filter(Boolean)
              .sort()
              .at(-1)!
          : null;
    }
  };
  resumes.sort((a, b) => {
    const ka = cle(a);
    const kb = cle(b);
    if (ka === null && kb === null) return a.ouvrage.id < b.ouvrage.id ? -1 : 1;
    if (ka === null) return 1; // les vides en fin, quel que soit le sens
    if (kb === null) return -1;
    if (typeof ka === "string" && typeof kb === "string") {
      const c = ka.localeCompare(kb, "fr");
      if (c !== 0) return c * sens;
    } else if (ka !== kb) {
      return ((ka as number) < (kb as number) ? -1 : 1) * sens;
    }
    return a.ouvrage.id < b.ouvrage.id ? -1 : 1;
  });

  const total = resumes.length;
  const debut = (page - 1) * parPage;
  return {
    lignes: resumes.slice(debut, debut + parPage),
    total,
    page,
    parPage,
    totalApproche: false,
  };
}

// ---------------------------------------------------------------------
// obtenirOuvrage / statsOuvrage / statsParZone
// ---------------------------------------------------------------------

export async function obtenirOuvrage(id: UUID): Promise<Ouvrage | null> {
  const [r] = await sql`
    select ${SELECT_OUVRAGE}
    from ouvrages o left join lots l on l.id = o.lot_id
    where o.id = ${id}`;
  return r ? versOuvrage(r) : null;
}

export async function statsOuvrage(
  id: UUID,
  filtres?: FiltresPrix,
): Promise<StatsPrix | null> {
  const f = { ...FILTRES_DEFAUT, ...filtres };
  const zoneUnique = f.zones && f.zones.length === 1 ? f.zones[0] : null;
  const niveau =
    f.typeTravaux === "tous" ? "global" : zoneUnique ? "zone" : "type";
  const [r] = await sql`
    select ${SELECT_STATS}
    from v_lignes_agregables v
    left join zones z on z.id = v.zone_id
    where v.ouvrage_id = ${id}
    ${condTypeTravaux(f)}
    ${condFiltres(f)}
  `;
  return versStatsPrix(r, {
    ouvrageId: id,
    niveau,
    estTs: f.typeTravaux === "tous" ? null : f.typeTravaux === "ts",
    zone: zoneUnique,
  });
}

export async function statsParZone(
  id: UUID,
  filtres?: FiltresPrix,
): Promise<StatsZone[]> {
  const f = { ...FILTRES_DEFAUT, ...filtres };
  const global = await statsOuvrage(id, { ...f, zones: undefined });

  const lignes = await sql`
    select z.code as zone_code, ${SELECT_STATS}
    from v_lignes_agregables v
    join zones z on z.id = v.zone_id
    where v.ouvrage_id = ${id}
    ${condTypeTravaux(f)}
    ${f.depuis ? sql`and v.date_document >= ${f.depuis}` : sql``}
    ${f.jusquA ? sql`and v.date_document <= ${f.jusquA}` : sql``}
    group by z.code
  `;
  const parZone = new Map(lignes.map((r) => [r.zone_code as CodeZone, r]));

  const zones = await sql`select code, libelle from zones order by ordre`;
  return zones.map((z) => {
    const code = z.code as CodeZone;
    const stats = versStatsPrix(parZone.get(code), {
      ouvrageId: id,
      niveau: "zone",
      estTs: f.typeTravaux === "tous" ? null : f.typeTravaux === "ts",
      zone: code,
    });
    const reference = global
      ? f.indexe
        ? global.medianeIndexee
        : global.mediane
      : null;
    const valeur = stats
      ? f.indexe
        ? stats.medianeIndexee
        : stats.mediane
      : null;
    return {
      zone: code,
      zoneLibelle: (z.libelle as string) ?? LIBELLES_ZONES[code],
      stats,
      ecartGlobal:
        stats && reference && reference > 0 && valeur !== null
          ? Math.round((valeur / reference - 1) * 1000) / 10
          : null,
      insuffisant: !stats || stats.n < 3,
    };
  });
}

// ---------------------------------------------------------------------
// Forfaits
// ---------------------------------------------------------------------

export async function statsForfait(id: UUID): Promise<StatsForfait[]> {
  const lignes = await sql`
    select * from mv_forfaits_ouvrage where ouvrage_id = ${id}
    order by est_ts`;
  return lignes.map((r) => ({
    ouvrageId: id,
    estTs: Boolean(r.est_ts),
    n: Number(r.n),
    montantMoyen: Number(r.montant_moyen),
    montantMedian: Number(r.montant_median),
    pctMoyenChantier: Number(r.pct_moyen_chantier),
    pctMedianChantier: Number(r.pct_median_chantier),
    chantierMin: Number(r.chantier_min),
    chantierMax: Number(r.chantier_max),
  }));
}

// ---------------------------------------------------------------------
// Séries : évolution temporelle et effet quantité
// ---------------------------------------------------------------------

function versPoint(r: Record<string, unknown>): PointQuantite {
  return {
    documentId: r.document_id as UUID,
    date: r.date as string,
    quantite: Number(r.quantite),
    pu: Number(r.pu_ht),
    puIndexe: Number(r.pu_indexe),
    estTs: Boolean(r.est_ts),
    zone: (r.zone_code as CodeZone) ?? null,
  };
}

export async function serieTemporelle(
  id: UUID,
  filtres?: FiltresPrix,
): Promise<PointQuantite[]> {
  const f = { ...FILTRES_DEFAUT, ...filtres };
  const lignes = await sql`
    select v.document_id, v.date_document::text as date, v.quantite,
           v.pu_ht, v.pu_indexe, v.est_ts, z.code as zone_code
    from v_lignes_agregables v
    left join zones z on z.id = v.zone_id
    where v.ouvrage_id = ${id}
    ${condFiltres(f)}
    order by v.date_document
  `;
  return lignes.map(versPoint);
}

export async function effetQuantite(
  id: UUID,
  filtres?: FiltresPrix,
): Promise<{ points: PointQuantite[]; seuil: SeuilQuantite | null }> {
  const f = { ...FILTRES_DEFAUT, ...filtres };
  const lignes = await sql`
    select v.document_id, v.date_document::text as date, v.quantite,
           v.pu_ht, v.pu_indexe, v.est_ts, z.code as zone_code
    from v_effet_quantite v
    left join zones z on z.id = v.zone_id
    where v.ouvrage_id = ${id}
    order by v.quantite
  `;
  const points = lignes.map(versPoint);

  // Seuil calculé en SQL : au moins 4 points de chaque côté et une
  // médiane au-dessus inférieure d'au moins 5 %. Sinon : null, et la
  // fiche n'affiche aucune phrase.
  const colonne = f.indexe ? sql`pu_indexe` : sql`pu_ht`;
  const [seuilRow] = await sql`
    with pts as (
      select quantite, ${colonne} as pu
      from v_effet_quantite where ouvrage_id = ${id}
    ),
    candidats as (select distinct quantite as s from pts),
    evaluation as (
      select s,
        (select count(*) from pts where quantite <  s)::int as n_dessous,
        (select count(*) from pts where quantite >= s)::int as n_dessus,
        (select (percentile_cont(0.5) within group (order by pu))::float
           from pts where quantite <  s) as med_dessous,
        (select (percentile_cont(0.5) within group (order by pu))::float
           from pts where quantite >= s) as med_dessus
      from candidats
    )
    select * from evaluation
    where n_dessous >= 4 and n_dessus >= 4
      and med_dessus < med_dessous * 0.95
    order by (med_dessous - med_dessus) desc, s asc
    limit 1
  `;

  const ouvrage = await obtenirOuvrage(id);
  const seuil: SeuilQuantite | null = seuilRow
    ? {
        seuil: Number(seuilRow.s),
        unite: ouvrage?.unite ?? "u",
        medianeEnDessous: Math.round(Number(seuilRow.med_dessous) * 100) / 100,
        medianeAuDessus: Math.round(Number(seuilRow.med_dessus) * 100) / 100,
        nEnDessous: Number(seuilRow.n_dessous),
        nAuDessus: Number(seuilRow.n_dessus),
      }
    : null;

  return { points, seuil };
}

/** Écran Frais de chantier : tous les ouvrages forfaitaires actifs, avec
 *  leurs statistiques (part du chantier) quand des lignes sont validées. */
export async function listerFrais(): Promise<FraisResume[]> {
  const lignes = await sql`
    select ${SELECT_OUVRAGE},
           f.est_ts, f.n, f.montant_moyen, f.montant_median,
           f.pct_moyen_chantier, f.pct_median_chantier, f.chantier_min, f.chantier_max
    from ouvrages o
    left join lots l on l.id = o.lot_id
    left join mv_forfaits_ouvrage f on f.ouvrage_id = o.id
    where o.actif and o.est_forfaitaire
    order by f.pct_median_chantier desc nulls last, o.libelle_devis`;
  const parOuvrage = new Map<UUID, FraisResume>();
  for (const r of lignes) {
    const id = r.id as UUID;
    const entree = parOuvrage.get(id) ?? { ouvrage: versOuvrage(r), normaux: null, ts: null };
    if (r.n !== null && r.n !== undefined) {
      const stats: StatsForfait = {
        ouvrageId: id,
        estTs: Boolean(r.est_ts),
        n: Number(r.n),
        montantMoyen: Number(r.montant_moyen),
        montantMedian: Number(r.montant_median),
        pctMoyenChantier: Number(r.pct_moyen_chantier),
        pctMedianChantier: Number(r.pct_median_chantier),
        chantierMin: Number(r.chantier_min),
        chantierMax: Number(r.chantier_max),
      };
      if (stats.estTs) entree.ts = stats;
      else entree.normaux = stats;
    }
    parOuvrage.set(id, entree);
  }
  return [...parOuvrage.values()];
}

// ---------------------------------------------------------------------
// Co-occurrences
// ---------------------------------------------------------------------

export async function cooccurrences(
  id: UUID,
  limite = 5,
): Promise<Cooccurrence[]> {
  const lignes = await sql`
    select
      case when c.ouvrage_a = ${id} then c.ouvrage_b else c.ouvrage_a end as autre_id,
      case when c.ouvrage_a = ${id} then c.taux_si_a else c.taux_si_b end as taux,
      c.n_ensemble,
      case when c.ouvrage_a = ${id} then c.ratio_median_b_sur_a
           when c.ratio_median_b_sur_a is null or c.ratio_median_b_sur_a = 0 then null
           else round(1.0 / c.ratio_median_b_sur_a, 3) end as ratio,
      o.libelle_devis, o.unite_reference
    from mv_cooccurrence c
    join ouvrages o on o.id =
      case when c.ouvrage_a = ${id} then c.ouvrage_b else c.ouvrage_a end
    where (c.ouvrage_a = ${id} or c.ouvrage_b = ${id}) and o.actif = true
    order by 2 desc, c.n_ensemble desc
    limit ${limite}
  `;
  return lignes.map((r) => ({
    ouvrage: {
      id: r.autre_id as UUID,
      libelleDevis: r.libelle_devis as string,
      unite: (r.unite_reference as CodeUnite) ?? null,
    },
    taux: Number(r.taux),
    nEnsemble: Number(r.n_ensemble),
    ratioQuantite: r.ratio === null ? null : Number(r.ratio),
  }));
}

// ---------------------------------------------------------------------
// Lignes sources d'un ouvrage
// ---------------------------------------------------------------------

export function versLigneContexte(
  r: Record<string, unknown>,
): LigneSourceContexte {
  return {
    id: r.id as UUID,
    documentId: r.document_id as UUID,
    ordre: Number(r.ordre),
    designationBrute: r.designation_brute as string,
    uniteBrute: (r.unite_brute as string) ?? null,
    unite: (r.unite_code as CodeUnite) ?? null,
    quantite: r.quantite === null ? null : Number(r.quantite),
    pu: r.pu_ht === null ? null : Number(r.pu_ht),
    puIndexe: r.pu_indexe === null || r.pu_indexe === undefined ? null : Number(r.pu_indexe),
    total: r.total_ht === null ? null : Number(r.total_ht),
    attributs:
      (r.attributs as Record<string, string | number | boolean | null>) ?? {},
    estForfait: Boolean(r.est_forfait),
    excluAgregats: Boolean(r.exclu_agregats),
    motifExclusion: (r.motif_exclusion as string) ?? null,
    date: r.date_document as string,
    numeroDocument: (r.numero_document as string) ?? null,
    client: (r.client_nom as string) ?? null,
    chantierObjet: (r.chantier_objet as string) ?? null,
    zone: (r.zone_code as CodeZone) ?? null,
    zoneFiable: Boolean(r.zone_fiable),
    estTs: Boolean(r.est_ts),
    lienPdf: r.storage_path ? `/api/documents/${r.document_id as string}/fichier` : null,
    statutDocument: (r.statut_document as StatutDocument) ?? undefined,
    controleLigne: (r.controle_ligne as ControleLigne) ?? undefined,
  };
}

export async function lignesSources(
  id: UUID,
  filtres?: FiltresPrix,
  page = 1,
): Promise<Page<LigneSourceContexte>> {
  const f = { ...FILTRES_DEFAUT, ...filtres };
  const parPage = 50;

  const condType =
    f.typeTravaux === "normaux"
      ? sql`and d.est_ts = false`
      : f.typeTravaux === "ts"
        ? sql`and d.est_ts = true`
        : sql``;

  const lignes = await sql`
    select l.id, l.document_id, l.ordre, l.designation_brute, l.unite_brute,
           l.quantite, l.pu_ht, l.total_ht, l.unite_code, l.attributs,
           l.est_forfait, r.exclu_agregats, r.motif_exclusion,
           d.date_document::text as date_document, d.numero_document,
           c.nom_normalise as client_nom, d.chantier_objet,
           z.code as zone_code, d.zone_fiable, d.est_ts, d.storage_path,
           d.statut as statut_document, l.controle_ligne,
           round(l.pu_ht * (
             (select coefficient from index_prix order by mois desc limit 1)
             / coalesce(ip.coefficient, 1)), 4)::float as pu_indexe,
           count(*) over ()::int as total_compte
    from lignes_source l
    join rattachements r on r.ligne_source_id = l.id and r.valide = true
    join documents d on d.id = l.document_id
    left join clients c on c.id = d.client_id
    left join zones z on z.id = d.zone_id
    left join index_prix ip on ip.mois = date_trunc('month', d.date_document)::date
    where r.ouvrage_id = ${id}
      and ${COND_LIGNE_COMPTEE}
      ${condType}
      ${f.depuis ? sql`and d.date_document >= ${f.depuis}` : sql``}
      ${f.jusquA ? sql`and d.date_document <= ${f.jusquA}` : sql``}
      ${f.zones && f.zones.length > 0 ? sql`and z.code = any(${f.zones as string[]})` : sql``}
    order by d.date_document desc, l.ordre
    limit ${parPage} offset ${(page - 1) * parPage}
  `;

  return {
    lignes: lignes.map(versLigneContexte),
    total: lignes.length > 0 ? Number(lignes[0].total_compte) : 0,
    page,
    parPage,
    totalApproche: false,
  };
}

// ---------------------------------------------------------------------
// Exclusion / réintégration d'une ligne des agrégats
// ---------------------------------------------------------------------

export async function exclureLigne(ligneId: UUID, motif: string): Promise<void> {
  await sql`update rattachements
    set exclu_agregats = true, motif_exclusion = ${motif}
    where ligne_source_id = ${ligneId}`;
  await sql`select rafraichir_agregats()`;
}

export async function reintegrerLigne(ligneId: UUID): Promise<void> {
  await sql`update rattachements
    set exclu_agregats = false, motif_exclusion = null
    where ligne_source_id = ${ligneId}`;
  await sql`select rafraichir_agregats()`;
}
