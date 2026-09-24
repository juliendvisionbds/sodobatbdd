-- =====================================================================
-- SODOBAT — 05_calage.sql — calage en masse, annulation, fusions
--
-- 1. Règle par ligne : une ligne compte dans les prix sauf si son
--    arithmétique est fausse (controle_ligne = 'ecart') ou si sa pièce
--    est rejetée. Une pièce « à revoir » n'exclut plus ses lignes.
-- 2. Journal de calage : chaque geste (validation, changement de cible,
--    création, auto-validation, fusion) est journalisé avec l'état
--    précédent, ce qui rend tout geste annulable.
-- 3. Propositions de fusion d'ouvrages (quasi-doublons du référentiel).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colonnes
-- ---------------------------------------------------------------------
alter table documents
  add column if not exists revu_par    text,
  add column if not exists revu_le     timestamptz,
  add column if not exists motif_revue text;

-- lignes écartées par le rattachement (hors périmètre : administratif,
-- « pour mémoire », illisible). Évite de les renvoyer à chaque relance.
alter table lignes_source
  add column if not exists hors_perimetre       boolean not null default false,
  add column if not exists motif_hors_perimetre text;

-- ---------------------------------------------------------------------
-- 2. Journal de calage (annulation)
-- ---------------------------------------------------------------------
create table if not exists calage_journal (
  id                  bigserial primary key,
  lot_id              uuid not null,            -- un geste = un lot d'entrées
  action              text not null,            -- valider|modifier|creer|rattacher|devalider|auto|auto-llm|par_ouvrage|fusion
  rattachement_id     uuid references rattachements(id) on delete cascade,
  avant               jsonb,                    -- null : le rattachement n'existait pas
  apres               jsonb,
  ouvrage_cree_id     uuid references ouvrages(id),
  ouvrage_fusionne_id uuid references ouvrages(id),
  acteur              text,
  annule_le           timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists calage_journal_lot on calage_journal (lot_id);
create index if not exists calage_journal_actif
  on calage_journal (created_at desc) where annule_le is null;
alter table calage_journal enable row level security;

-- ---------------------------------------------------------------------
-- 3. Propositions de fusion
-- ---------------------------------------------------------------------
create table if not exists fusions_proposees (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references ouvrages(id) on delete cascade,
  cible_id    uuid not null references ouvrages(id) on delete cascade,
  score       numeric(4,3),
  methode     text not null default 'trigramme',   -- 'trigramme'|'llm'
  avis_llm    text,                                 -- 'meme'|'distinct'|'incertain'
  motif       text,
  statut      text not null default 'proposee',    -- 'proposee'|'acceptee'|'refusee'|'obsolete'
  decide_par  text,
  decide_le   timestamptz,
  created_at  timestamptz not null default now(),
  check (source_id <> cible_id)
);
create unique index if not exists fusions_proposees_paire
  on fusions_proposees (least(source_id, cible_id), greatest(source_id, cible_id));
create index if not exists fusions_proposees_statut on fusions_proposees (statut);
alter table fusions_proposees enable row level security;

-- ---------------------------------------------------------------------
-- 4. Alias d'unités rencontrés dans les pièces réelles
-- ---------------------------------------------------------------------
insert into unites_alias (alias, code_unite, facteur) values
  ('e',   'ens',     1),
  ('E',   'ens',     1),
  ('for', 'forfait', 1),
  ('fo',  'forfait', 1),
  ('F',   'forfait', 1)
on conflict (alias) do nothing;

update lignes_source l
   set unite_code = a.code_unite,
       quantite_normalisee = case
         when l.quantite is null then null
         else round(l.quantite * a.facteur, 3) end
  from unites_alias a
 where l.unite_code is null
   and l.unite_brute is not null
   and lower(trim(l.unite_brute)) = lower(a.alias);

-- ---------------------------------------------------------------------
-- 5. Vue de base : règle par ligne
--    (même liste de colonnes, deux colonnes AJOUTÉES EN FIN : autorisé
--     par create or replace ; les vues dépendantes restent valides)
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
  round(
    l.pu_ht * (
      (select coefficient from index_prix order by mois desc limit 1)
      / coalesce(ip.coefficient, 1)
    ), 4
  )                   as pu_indexe,
  d.statut            as statut_document,
  l.controle_ligne
from lignes_source l
join rattachements r on r.ligne_source_id = l.id
join documents     d on d.id = l.document_id
join ouvrages      o on o.id = r.ouvrage_id
left join unites   u on u.code = l.unite_code
left join index_prix ip on ip.mois = date_trunc('month', d.date_document)::date
where d.statut <> 'rejete'
  and l.controle_ligne <> 'ecart'
  and r.valide is true
  and r.exclu_agregats is false
  and l.est_titre is false
  and l.pu_ht is not null
  and l.pu_ht > 0
  and o.est_forfaitaire is false
  and coalesce(u.agregable, true) is true;

-- ---------------------------------------------------------------------
-- 6. Forfaits : même règle (pas de dépendant, drop/create)
-- ---------------------------------------------------------------------
drop materialized view if exists mv_forfaits_ouvrage;
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
where d.statut <> 'rejete'
  and l.controle_ligne <> 'ecart'
  and r.valide is true
  and r.exclu_agregats is false
  and o.est_forfaitaire is true
  and d.total_ht > 0
group by r.ouvrage_id, d.est_ts;

create unique index on mv_forfaits_ouvrage (ouvrage_id, est_ts);

-- ---------------------------------------------------------------------
-- 7. Recalcul
-- ---------------------------------------------------------------------
select rafraichir_agregats();
