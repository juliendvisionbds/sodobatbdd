-- =====================================================================
-- SODOBAT — 02_agregats.sql
--
-- Toutes les statistiques demandées (prix moyen, min, max, par zone, TS ou
-- non) sont ICI, en vues. Jamais en colonnes de table.
--
-- Raison : dès qu'on les fige en colonnes, on ne peut plus filtrer
-- (moyenne 2025-2026 seulement, hors TS, zone 06 uniquement) et tout
-- périme à la première nouvelle facture importée.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Base agrégeable : lignes rattachées, validées, comparables.
-- ---------------------------------------------------------------------
create or replace view v_lignes_agregables as
select
  l.id                as ligne_id,
  r.ouvrage_id,
  d.id                as document_id,
  d.date_document,
  d.est_ts,
  d.zone_id,
  d.zone_fiable,
  d.client_id,
  l.quantite_normalisee as quantite,
  l.pu_ht,
  l.total_ht,
  l.unite_code,
  -- prix ramené à aujourd'hui via l'index BT01
  round(
    l.pu_ht * (
      (select coefficient from index_prix order by mois desc limit 1)
      / coalesce(ip.coefficient, 1)
    ), 4
  )                   as pu_indexe
from lignes_source l
join rattachements r on r.ligne_source_id = l.id
join documents     d on d.id = l.document_id
join ouvrages      o on o.id = r.ouvrage_id
left join unites   u on u.code = l.unite_code
left join index_prix ip on ip.mois = date_trunc('month', d.date_document)::date
where d.statut = 'valide'
  and r.valide is true
  and r.exclu_agregats is false
  and l.est_titre is false
  and l.pu_ht is not null
  and l.pu_ht > 0
  and o.est_forfaitaire is false          -- les forfaits ont leur propre vue
  and coalesce(u.agregable, true) is true;


-- ---------------------------------------------------------------------
-- Statistiques par ouvrage.
--
-- GROUPING SETS produit en une passe les trois granularités dont le
-- tableau a besoin : par zone, par type de travaux, et tous confondus.
-- niveau = 'zone' | 'type' | 'global'
-- ---------------------------------------------------------------------
create materialized view mv_stats_ouvrage as
select
  ouvrage_id,
  est_ts,
  zone_id,
  case
    when grouping(zone_id) = 0 then 'zone'
    when grouping(est_ts)  = 0 then 'type'
    else 'global'
  end                                                    as niveau,

  count(*)                                               as n,
  count(distinct document_id)                            as n_chantiers,

  min(pu_ht)                                             as pu_min,
  max(pu_ht)                                             as pu_max,
  round(avg(pu_ht), 2)                                   as pu_moyen,
  -- La médiane est le chiffre de référence : elle résiste aux valeurs
  -- aberrantes, la moyenne non.
  round(percentile_cont(0.5) within group (order by pu_ht)::numeric, 2)  as pu_median,
  round(percentile_cont(0.25) within group (order by pu_ht)::numeric, 2) as pu_p25,
  round(percentile_cont(0.75) within group (order by pu_ht)::numeric, 2) as pu_p75,
  round(stddev_samp(pu_ht), 2)                           as pu_ecart_type,
  case when avg(pu_ht) > 0
       then round(stddev_samp(pu_ht) / avg(pu_ht), 3) end as coef_variation,

  -- prix actualisés : le chiffre à afficher par défaut
  round(percentile_cont(0.5) within group (order by pu_indexe)::numeric, 2) as pu_median_indexe,
  round(avg(pu_indexe), 2)                               as pu_moyen_indexe,

  min(date_document)                                     as premiere_occurrence,
  max(date_document)                                     as derniere_occurrence,
  sum(quantite)                                          as quantite_cumulee,
  bool_and(zone_fiable)                                  as zone_toujours_fiable,

  -- Indice de confiance affiché à côté de chaque prix. Un prix issu d'une
  -- occurrence ne doit jamais avoir le même poids visuel qu'un prix issu de 30.
  case
    when count(*) >= 10 and coalesce(stddev_samp(pu_ht) / nullif(avg(pu_ht),0), 1) < 0.25 then 'haute'
    when count(*) >= 4  then 'moyenne'
    else 'faible'
  end                                                    as fiabilite

from v_lignes_agregables
group by grouping sets (
  (ouvrage_id, est_ts, zone_id),
  (ouvrage_id, est_ts),
  (ouvrage_id)
);

create unique index on mv_stats_ouvrage (ouvrage_id, coalesce(est_ts, false), coalesce(zone_id, '00000000-0000-0000-0000-000000000000'), niveau);
create index on mv_stats_ouvrage (ouvrage_id, niveau);


-- ---------------------------------------------------------------------
-- Frais de chantier (lignes 'ens' : étude béton, amenée/repli, décoffrage).
--
-- Ces lignes n'ont pas de prix unitaire comparable — mais leur poids
-- relatif, lui, l'est. Sur le devis Croix du Sud : 7 560 € sur 49 548 €,
-- soit 15,3 %. Sur 400 documents, on obtient la vraie courbe des frais
-- fixes par typologie de chantier. Sodobat n'a cette donnée nulle part.
-- ---------------------------------------------------------------------
create materialized view mv_forfaits_ouvrage as
select
  r.ouvrage_id,
  d.est_ts,
  count(*)                                               as n,
  round(avg(l.total_ht), 2)                              as montant_moyen,
  round(percentile_cont(0.5) within group (order by l.total_ht)::numeric, 2) as montant_median,
  round(avg(l.total_ht / nullif(d.total_ht, 0)) * 100, 2)                    as pct_moyen_chantier,
  round(percentile_cont(0.5) within group
        (order by l.total_ht / nullif(d.total_ht, 0))::numeric * 100, 2)     as pct_median_chantier,
  min(d.total_ht)                                        as chantier_min,
  max(d.total_ht)                                        as chantier_max
from lignes_source l
join rattachements r on r.ligne_source_id = l.id
join documents     d on d.id = l.document_id
join ouvrages      o on o.id = r.ouvrage_id
where d.statut = 'valide'
  and r.valide is true
  and r.exclu_agregats is false
  and o.est_forfaitaire is true
  and d.total_ht > 0
group by r.ouvrage_id, d.est_ts;

create unique index on mv_forfaits_ouvrage (ouvrage_id, est_ts);


-- ---------------------------------------------------------------------
-- Effet quantité.
--
-- Le PU d'un chantier de 500 m² n'est pas celui d'un chantier de 20 m².
-- Cette vue alimente le nuage de points de la fiche ouvrage. C'est
-- probablement l'information la plus utile au métreur, et personne ne la
-- lui donne aujourd'hui.
-- ---------------------------------------------------------------------
create or replace view v_effet_quantite as
select
  ouvrage_id,
  est_ts,
  quantite,
  pu_ht,
  pu_indexe,
  date_document,
  zone_id,
  document_id
from v_lignes_agregables
where quantite is not null and quantite > 0;


-- ---------------------------------------------------------------------
-- Co-occurrence. Gratuite, et c'est le socle de la génération de devis :
-- "quand on facture des IPN, on facture aussi des sabots dans 78 % des cas".
-- Sur le devis Croix du Sud : 120 IPN -> 240 sabots, 120 passivations,
-- 120 enduits. Le ratio 2 sabots/IPN est déductible.
-- ---------------------------------------------------------------------
create materialized view mv_cooccurrence as
with paires as (
  select
    least(a.ouvrage_id, b.ouvrage_id)    as ouvrage_a,
    greatest(a.ouvrage_id, b.ouvrage_id) as ouvrage_b,
    a.document_id,
    a.quantite as qte_a,
    b.quantite as qte_b
  from v_lignes_agregables a
  join v_lignes_agregables b
    on a.document_id = b.document_id
   and a.ouvrage_id  < b.ouvrage_id
),
totaux as (
  select ouvrage_id, count(distinct document_id) as n_docs
  from v_lignes_agregables group by ouvrage_id
)
select
  p.ouvrage_a,
  p.ouvrage_b,
  count(distinct p.document_id)                          as n_ensemble,
  ta.n_docs                                              as n_a,
  tb.n_docs                                              as n_b,
  round(count(distinct p.document_id)::numeric / ta.n_docs, 3) as taux_si_a,
  round(count(distinct p.document_id)::numeric / tb.n_docs, 3) as taux_si_b,
  round(percentile_cont(0.5) within group
        (order by p.qte_b / nullif(p.qte_a, 0))::numeric, 3)   as ratio_median_b_sur_a
from paires p
join totaux ta on ta.ouvrage_id = p.ouvrage_a
join totaux tb on tb.ouvrage_id = p.ouvrage_b
group by p.ouvrage_a, p.ouvrage_b, ta.n_docs, tb.n_docs
having count(distinct p.document_id) >= 3;

create unique index on mv_cooccurrence (ouvrage_a, ouvrage_b);


-- ---------------------------------------------------------------------
-- Historique des devis (2e écran demandé) : toutes les lignes, sans
-- moyennes, recherchables par client.
-- ---------------------------------------------------------------------
create or replace view v_historique as
select
  d.id            as document_id,
  d.numero_document,
  d.date_document,
  d.type_document,
  d.est_ts,
  c.nom_normalise as client,
  d.chantier_objet,
  d.chantier_commune,
  z.libelle       as zone,
  d.total_ht      as total_document_ht,
  l.ordre,
  l.designation_brute,
  l.unite_brute,
  l.quantite,
  l.pu_ht,
  l.total_ht      as ligne_total_ht,
  o.libelle_devis as ouvrage,
  lo.libelle      as lot,
  r.valide        as rattachement_valide,
  d.storage_path
from lignes_source l
join documents     d  on d.id = l.document_id
left join clients  c  on c.id = d.client_id
left join zones    z  on z.id = d.zone_id
left join rattachements r on r.ligne_source_id = l.id
left join ouvrages o  on o.id = r.ouvrage_id
left join lots     lo on lo.id = o.lot_id
where l.est_titre is false;


-- ---------------------------------------------------------------------
-- Rafraîchissement (appelé en fin d'import et après chaque session de calage)
-- ---------------------------------------------------------------------
create or replace function rafraichir_agregats() returns void as $$
begin
  refresh materialized view concurrently mv_stats_ouvrage;
  refresh materialized view concurrently mv_forfaits_ouvrage;
  refresh materialized view concurrently mv_cooccurrence;
end;
$$ language plpgsql;
