-- =====================================================================
-- SODOBAT — 03_app.sql — compléments applicatifs
-- (01_schema.sql et 02_agregats.sql restent inchangés)
-- =====================================================================

-- /calage exige un code marqué administrateur (04_build_cursor.md §5).
-- La table acces du schéma n'a pas ce drapeau : on l'ajoute ici.
alter table acces add column if not exists est_admin boolean not null default false;

-- Recherche trigramme sur les libellés de devis (le schéma n'indexe que
-- libelle_normalise) : la recherche du tableau porte sur les deux.
create index if not exists ouvrages_libelle_devis_trgm
  on ouvrages using gin (libelle_devis gin_trgm_ops);

-- refresh materialized view CONCURRENTLY exige un index unique sans
-- expression. Celui de 02_agregats.sql utilise coalesce() : inéligible.
-- PG15+ : nulls not distinct couvre les niveaux 'global' et 'type'.
create unique index if not exists mv_stats_ouvrage_cle_unique
  on mv_stats_ouvrage (ouvrage_id, est_ts, zone_id, niveau)
  nulls not distinct;
