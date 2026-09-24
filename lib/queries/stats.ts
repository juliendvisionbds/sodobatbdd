// =====================================================================
// Fragments SQL et conversions partagés par la couche de requêtes.
//
// Les statistiques sont agrégées EN SQL, à la volée, sur
// v_lignes_agregables : c'est ce qui permet les filtres de période et
// de zone que la vue matérialisée (figée) ne peut pas offrir. Aucune
// statistique n'est recalculée en TypeScript : ici on ne fait que
// mapper des lignes SQL vers les types du contrat.
// =====================================================================

import { sql } from "../db";
import type {
  CodeZone,
  Fiabilite,
  FiltresPrix,
  NiveauStat,
  StatsPrix,
  UUID,
} from "../types";

// ---------------------------------------------------------------------
// Fragment SELECT commun d'agrégation de prix (alias de table : v)
// ---------------------------------------------------------------------

export const SELECT_STATS = sql`
  count(*)::int                                                       as n,
  count(distinct v.document_id)::int                                  as n_chantiers,
  min(v.pu_ht)::float                                                 as min_brut,
  max(v.pu_ht)::float                                                 as max_brut,
  avg(v.pu_ht)::float                                                 as moyenne,
  (percentile_cont(0.5)  within group (order by v.pu_ht))::float      as mediane,
  (percentile_cont(0.25) within group (order by v.pu_ht))::float      as p25,
  (percentile_cont(0.75) within group (order by v.pu_ht))::float      as p75,
  stddev_samp(v.pu_ht)::float                                         as ecart_type,
  min(v.pu_indexe)::float                                             as min_indexe,
  max(v.pu_indexe)::float                                             as max_indexe,
  avg(v.pu_indexe)::float                                             as moyenne_indexee,
  (percentile_cont(0.5)  within group (order by v.pu_indexe))::float  as mediane_indexee,
  (percentile_cont(0.25) within group (order by v.pu_indexe))::float  as p25_indexe,
  (percentile_cont(0.75) within group (order by v.pu_indexe))::float  as p75_indexe,
  min(v.date_document)::text                                          as premiere,
  max(v.date_document)::text                                          as derniere,
  sum(v.quantite)::float                                              as quantite_cumulee,
  bool_and(v.zone_fiable)                                             as zone_toujours_fiable
`;

/**
 * Miroir de la règle de v_lignes_agregables (db/05_calage.sql) pour les
 * requêtes qui partent des tables (alias d = documents, l = lignes_source) :
 * une ligne compte sauf pièce rejetée ou arithmétique fausse.
 */
export const COND_LIGNE_COMPTEE = sql`
  d.statut <> 'rejete' and l.controle_ligne <> 'ecart'
`;

/** Conditions de filtre applicables à v_lignes_agregables (alias v, zones z). */
export function condFiltres(f?: FiltresPrix) {
  return sql`
    ${f?.depuis ? sql`and v.date_document >= ${f.depuis}` : sql``}
    ${f?.jusquA ? sql`and v.date_document <= ${f.jusquA}` : sql``}
    ${f?.zones && f.zones.length > 0 ? sql`and z.code = any(${f.zones as string[]})` : sql``}
  `;
}

export function condTypeTravaux(f?: FiltresPrix) {
  if (f?.typeTravaux === "normaux") return sql`and v.est_ts = false`;
  if (f?.typeTravaux === "ts") return sql`and v.est_ts = true`;
  return sql``;
}

// ---------------------------------------------------------------------
// Ligne SQL -> StatsPrix
// ---------------------------------------------------------------------

interface LigneStats {
  n: number;
  n_chantiers: number;
  min_brut: number;
  max_brut: number;
  moyenne: number;
  mediane: number;
  p25: number | null;
  p75: number | null;
  ecart_type: number | null;
  min_indexe: number;
  max_indexe: number;
  moyenne_indexee: number;
  mediane_indexee: number;
  p25_indexe: number | null;
  p75_indexe: number | null;
  premiere: string;
  derniere: string;
  quantite_cumulee: number | null;
  zone_toujours_fiable: boolean;
}

function fiabilitePour(n: number, cv: number | null): Fiabilite {
  // même règle que mv_stats_ouvrage (02_agregats.sql)
  if (n >= 10 && cv !== null && cv < 0.25) return "haute";
  if (n >= 4) return "moyenne";
  return "faible";
}

export function versStatsPrix(
  ligne: Record<string, unknown> | undefined,
  contexte: {
    ouvrageId: UUID;
    niveau: NiveauStat;
    estTs: boolean | null;
    zone: CodeZone | null;
  },
): StatsPrix | null {
  const r = ligne as LigneStats | undefined;
  if (!r || !r.n || Number(r.n) === 0) return null;
  const n = Number(r.n);
  const moyenne = Number(r.moyenne);
  const ecartType = r.ecart_type === null ? null : Number(r.ecart_type);
  const coefVariation =
    ecartType !== null && moyenne > 0
      ? Math.round((ecartType / moyenne) * 1000) / 1000
      : null;

  const arr = (x: number) => Math.round(x * 100) / 100;

  return {
    ouvrageId: contexte.ouvrageId,
    niveau: contexte.niveau,
    estTs: contexte.estTs,
    zone: contexte.zone,
    n,
    nChantiers: Number(r.n_chantiers),
    min: arr(Number(r.min_brut)),
    max: arr(Number(r.max_brut)),
    moyenne: arr(moyenne),
    mediane: arr(Number(r.mediane)),
    quartiles:
      n >= 4 && r.p25 !== null && r.p75 !== null
        ? { p25: arr(Number(r.p25)), p75: arr(Number(r.p75)) }
        : null,
    ecartType: ecartType === null ? null : arr(ecartType),
    coefVariation,
    medianeIndexee: arr(Number(r.mediane_indexee)),
    moyenneIndexee: arr(Number(r.moyenne_indexee)),
    minIndexe: arr(Number(r.min_indexe)),
    maxIndexe: arr(Number(r.max_indexe)),
    quartilesIndexes:
      n >= 4 && r.p25_indexe !== null && r.p75_indexe !== null
        ? { p25: arr(Number(r.p25_indexe)), p75: arr(Number(r.p75_indexe)) }
        : null,
    premiereOccurrence: r.premiere,
    derniereOccurrence: r.derniere,
    quantiteCumulee:
      r.quantite_cumulee === null ? null : Number(r.quantite_cumulee),
    fiabilite: fiabilitePour(n, coefVariation),
    zoneToujoursFiable: Boolean(r.zone_toujours_fiable),
  };
}
