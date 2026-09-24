-- =====================================================================
-- SODOBAT — 04_imports.sql
-- File d'import des documents : un enregistrement par fichier déposé,
-- suivi du statut de traitement, relance possible des échecs.
-- =====================================================================

create table imports (
  id             uuid primary key default gen_random_uuid(),
  fichier_nom    text not null,
  fichier_hash   text,
  taille_octets  bigint,

  -- 'en_attente' -> 'extraction' -> 'extrait' -> 'insere' | 'erreur' | 'doublon'
  statut         text not null default 'en_attente',
  message_erreur text,

  document_id    uuid references documents(id) on delete set null,

  -- récapitulatif du traitement (lignes, écarts, ouvrages créés...)
  bilan          jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on imports (statut);
create index on imports (created_at desc);

alter table imports enable row level security;
