-- =====================================================================
-- SODOBAT — 06_qualite.sql — qualité des unités, hors périmètre, pièces,
-- lots proposés. Doit passer en local sans pgvector : aucun littéral
-- vector(1536) ni hnsw ici.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Fonctions partagées
-- ---------------------------------------------------------------------

-- Une ligne peut-elle alimenter le prix unitaire d'un ouvrage ?
--   ouvrage sans unité : oui ; ligne sans unité : non (un humain décide) ;
--   ens et forfait sont interchangeables entre eux ; sinon égalité stricte.
create or replace function unite_compatible(ligne text, ouvrage text)
returns boolean language sql immutable parallel safe as $$
  select ouvrage is null
      or (ligne is not null and (
            ligne = ouvrage
         or (ligne in ('ens', 'forfait') and ouvrage in ('ens', 'forfait'))))
$$;

-- Désignation purement administrative (jamais un ouvrage). Reçoit un texte
-- déjà en minuscules sans accents (designation_recherche).
create or replace function est_designation_administrative(t text)
returns boolean language sql immutable parallel safe as $$
  select t ~ '(retenue de garantie|revision de prix|actualisation|remise|rabais|escompte|acompte|sous.?total|^total|^tva\M|pour memoire|\mp\.?m\.?\M|compte prorata|^option\M|^variante\M|arrondi|report\M|deja factur|penalit|avance forfaitaire|retenue\M|^lot \d|^chapitre|^recapitulatif|^montant\M|^base\M|^tranche)'
$$;

-- L'embedding d'un ouvrage ne vaut que pour son texte : on l'efface quand
-- le libellé, l'unité ou le lot change.
create or replace function ouvrages_invalider_embedding() returns trigger
language plpgsql as $$
begin
  if new.libelle_normalise is distinct from old.libelle_normalise
     or new.unite_reference is distinct from old.unite_reference
     or new.lot_id is distinct from old.lot_id then
    new.embedding := null;
  end if;
  return new;
end $$;
drop trigger if exists ouvrages_invalider_embedding on ouvrages;
create trigger ouvrages_invalider_embedding
  before update of libelle_normalise, unite_reference, lot_id on ouvrages
  for each row execute function ouvrages_invalider_embedding();

-- ---------------------------------------------------------------------
-- 1. Unités : « ens » en quantité > 1 est un prix unitaire comparable
-- ---------------------------------------------------------------------
update lignes_source
   set unite_code = 'u'
 where unite_code = 'ens' and quantite > 1;

-- est_forfait devient dérivé de l'unité (une seule source de vérité)
alter table lignes_source drop column if exists est_forfait;
alter table lignes_source
  add column est_forfait boolean
  generated always as (unite_code in ('ens', 'forfait')) stored;

-- ---------------------------------------------------------------------
-- 2. Vue de base : une ligne forfait n'entre jamais dans un prix unitaire
--    (même liste de colonnes qu'en 05 : create or replace autorisé)
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
  and l.est_forfait is false
  and coalesce(u.agregable, true) is true;

-- ---------------------------------------------------------------------
-- 3. Hors périmètre : une ligne à prix et quantité dont la désignation
--    n'est pas administrative redevient une ligne à rattacher
-- ---------------------------------------------------------------------
update lignes_source
   set hors_perimetre = false,
       motif_hors_perimetre = 'llm-conteste'
 where hors_perimetre
   and motif_hors_perimetre = 'llm'
   and pu_ht > 0 and quantite > 0
   and not est_designation_administrative(designation_recherche);

-- ---------------------------------------------------------------------
-- 4. Pièces : origine de la date
-- ---------------------------------------------------------------------
alter table documents
  add column if not exists date_source text;   -- 'document'|'raw'|'fichier'|'humain'
update documents set date_source = 'document'
 where date_document is not null and date_source is null;

-- ---------------------------------------------------------------------
-- 5. Lots proposés par l'IA (validés dans /calage → Lots)
-- ---------------------------------------------------------------------
create table if not exists lots_proposes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  libelle     text not null,
  parent_code text,
  ordre       int not null default 0,
  statut      text not null default 'propose',   -- 'propose'|'accepte'|'refuse'
  motif       text,
  lot_id      uuid references lots(id),
  created_at  timestamptz not null default now()
);
create table if not exists ouvrages_lots_proposes (
  ouvrage_id  uuid primary key references ouvrages(id) on delete cascade,
  lot_code    text not null,
  statut      text not null default 'propose',   -- 'propose'|'accepte'|'refuse'
  created_at  timestamptz not null default now()
);
alter table lots_proposes enable row level security;
alter table ouvrages_lots_proposes enable row level security;

-- ---------------------------------------------------------------------
-- 6. Lots métiers hors gros œuvre (Sodobat chiffre parfois en TCE)
-- ---------------------------------------------------------------------
insert into lots (code, libelle, ordre) values
  ('EL', 'Électricité',            7),
  ('PL', 'Plomberie et CVC',       8),
  ('ME', 'Menuiserie',             9),
  ('PE', 'Peinture et finitions', 10),
  ('VR', 'VRD et réseaux',        11),
  ('SO', 'Second œuvre divers',   12)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 7. Recalcul
-- ---------------------------------------------------------------------
select rafraichir_agregats();
