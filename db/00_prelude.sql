-- =====================================================================
-- SODOBAT — 00_prelude.sql
-- Extensions + wrapper immutable pour unaccent.
--
-- unaccent() est STABLE, pas IMMUTABLE : Postgres refuse son emploi
-- direct dans une colonne générée (le 01_schema.sql d'origine échoue,
-- y compris sur Supabase). f_unaccent est le wrapper immutable standard.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

create or replace function public.f_unaccent(t text)
returns text
language plpgsql immutable parallel safe strict
as $$
begin
  -- résolution du dictionnaire via search_path à l'exécution :
  -- fonctionne que unaccent soit dans public (local) ou extensions (Supabase)
  return unaccent('unaccent', t);
end
$$;
