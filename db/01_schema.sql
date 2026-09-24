-- =====================================================================
-- SODOBAT — Base de données intelligente des prix d'ouvrages
-- 01_schema.sql — tables (Supabase / Postgres 15+)
--
-- Principe directeur : 3 couches strictement séparées.
--   1. SOURCE      : ce qui est écrit sur le document. Immuable. Jamais corrigé.
--   2. REFERENTIEL : les ouvrages canoniques. Curé par l'humain. Réécrivable.
--   3. RATTACHEMENT: le lien entre les deux, avec score et validation.
--
-- Aucune statistique n'est stockée en colonne. Voir 02_agregats.sql.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";


-- =====================================================================
-- REFERENTIELS TRANSVERSES
-- =====================================================================

-- Zones de prix. Non administratives : "Mercantour" est un découpage métier.
-- À faire valider commune par commune par Sodobat.
create table zones (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,          -- '06' | 'MERCANTOUR' | 'TOULON' | '83_AUTRE'
  libelle       text not null,
  ordre         int  not null default 0
);

create table zones_communes (
  code_postal   text not null,
  commune       text,
  zone_id       uuid not null references zones(id),
  primary key (code_postal, commune)
);

-- Normalisation des unités. Le document source écrit 'ens', 'u', 'U', 'ml', 'M2'...
-- facteur_conversion : ex. 'cm2' -> 'm2' = 0.0001. NULL si non convertible.
create table unites (
  code            text primary key,            -- 'm2','ml','m3','u','kg','h','forfait'
  libelle         text not null,
  est_forfaitaire boolean not null default false,
  agregable       boolean not null default true -- false => exclu des moyennes de PU
);

create table unites_alias (
  alias      text primary key,                 -- 'ens','U','u','M2','m²','ML','Ens.'
  code_unite text not null references unites(code),
  facteur    numeric not null default 1
);

-- Indexation temporelle. Un prix 2024 et un prix 2026 ne se comparent pas.
-- Source : index BT01 (INSEE) ou coefficient validé avec Sodobat.
create table index_prix (
  mois         date primary key,               -- toujours le 1er du mois
  coefficient  numeric(10,4) not null,
  source       text
);


-- =====================================================================
-- CLIENTS
-- =====================================================================

create table clients (
  id                uuid primary key default gen_random_uuid(),
  nom_normalise     text not null,
  type_client       text,                      -- 'copropriete'|'syndic'|'particulier'|'promoteur'|'bailleur'|'entreprise'|'collectivite'
  code_postal       text,
  commune           text,
  -- Pour une copro, adresse client = adresse chantier. Pour un syndic ou un
  -- bailleur, non. Détermine la fiabilité de la zone déduite.
  adresse_vaut_chantier boolean not null default false,
  created_at        timestamptz not null default now()
);

create table clients_alias (
  alias      text primary key,                 -- graphie brute rencontrée sur les documents
  client_id  uuid not null references clients(id) on delete cascade
);

create index on clients using gin (nom_normalise gin_trgm_ops);


-- =====================================================================
-- COUCHE 1 — SOURCE (immuable)
-- =====================================================================

create table documents (
  id                    uuid primary key default gen_random_uuid(),

  -- fichier
  fichier_nom           text not null,
  fichier_hash          text not null unique,  -- SHA-256, dédoublonnage à l'import
  storage_path          text,
  nb_pages              int,

  -- nature
  type_document         text not null,         -- 'devis'|'facture'|'situation'|'avenant'
  est_ts                boolean not null default false,  -- travaux supplémentaires
  numero_document       text,
  date_document         date,

  -- client / chantier
  client_nom_brut       text,
  client_id             uuid references clients(id),
  chantier_objet        text,                  -- "Reprise et renforcement des terrasses..."
  chantier_code_postal  text,
  chantier_commune      text,
  zone_id               uuid references zones(id),
  -- true = CP chantier explicite sur le document.
  -- false = déduit de l'adresse client => moyennes par zone à prendre avec prudence.
  zone_fiable           boolean not null default false,

  -- montants tels qu'imprimés
  total_ht              numeric(14,2),
  tva_taux              numeric(5,2),
  total_ttc             numeric(14,2),

  -- extraction
  extraction_modele     text,
  extraction_version    text,
  extraction_confiance  numeric(4,3),
  raw_json              jsonb,                 -- sortie brute du modèle, conservée telle quelle

  -- contrôle
  controle_total        text not null default 'non_verifie',  -- 'ok'|'ecart'|'non_verifiable'
  ecart_total           numeric(14,2),         -- somme(lignes) - total_ht
  statut                text not null default 'importe',      -- 'importe'|'a_revoir'|'valide'|'rejete'

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index on documents (date_document);
create index on documents (client_id);
create index on documents (zone_id);
create index on documents (statut);


create table lignes_source (
  id                  uuid primary key default gen_random_uuid(),
  document_id         uuid not null references documents(id) on delete cascade,
  page                int,
  ordre               int not null,

  -- VERBATIM. Fautes comprises ("Pacivation", "ventillation"). Jamais corrigé ici.
  designation_brute   text not null,
  unite_brute         text,
  quantite            numeric(14,3),
  pu_ht               numeric(14,4),
  total_ht            numeric(14,2),

  -- dérivé
  unite_code          text references unites(code),
  quantite_normalisee numeric(14,3),           -- après facteur de conversion
  est_titre           boolean not null default false,  -- ligne de section, sans prix
  est_forfait         boolean not null default false,

  -- attributs extraits de la désignation, en champs séparés.
  -- {"profile":"IPN","section_mm":160,"longueur_m":2.5,"materiau":"acier"}
  -- Coût quasi nul à l'extraction, très coûteux à rattraper après coup.
  attributs           jsonb not null default '{}'::jsonb,

  -- recherche
  -- (adaptation : f_unaccent, wrapper immutable défini dans 00_prelude.sql —
  --  unaccent() nu est refusé dans une colonne générée)
  designation_recherche text
    generated always as (public.f_unaccent(lower(designation_brute))) stored,
  embedding           vector(1536),

  -- contrôle : quantite * pu_ht = total_ht ?
  controle_ligne      text not null default 'non_verifie',  -- 'ok'|'ecart'|'non_verifiable'
  ecart               numeric(14,2),
  confiance           numeric(4,3),

  created_at          timestamptz not null default now()
);

create index on lignes_source (document_id);
create index on lignes_source using gin (designation_recherche gin_trgm_ops);
create index on lignes_source using gin (attributs jsonb_path_ops);
create index on lignes_source using hnsw (embedding vector_cosine_ops);


-- =====================================================================
-- COUCHE 2 — REFERENTIEL (curé)
-- =====================================================================

-- Arborescence lot -> sous-lot. Pas de catégorie texte plate : la structure
-- par lots est ce qui rendra la génération de devis possible plus tard.
create table lots (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,             -- 'GO', 'GO.CM', 'GO.CM.IPN'
  libelle    text not null,
  parent_id  uuid references lots(id),
  ordre      int not null default 0
);

create table ouvrages (
  id                  uuid primary key default gen_random_uuid(),
  lot_id              uuid references lots(id),
  code                text unique,             -- lisible par le métreur : 'GO-IPN-160'

  -- DEUX libellés, jamais un seul.
  libelle_normalise   text not null,           -- interne, sert au rapprochement
  libelle_devis       text not null,           -- propre, corrigé, imprimable sur un devis
  description_longue  text,
  notes_specifiques   text,

  unite_reference     text references unites(code),
  -- attributs qui distinguent cet ouvrage d'un autre du même lot
  attributs_cles      jsonb not null default '{}'::jsonb,

  -- true : ligne de frais de chantier (étude, amenée/repli, décoffrage...).
  -- Exclue des moyennes de PU, mais suivie en % du montant chantier.
  est_forfaitaire     boolean not null default false,

  actif               boolean not null default true,
  embedding           vector(1536),

  valide_par          text,
  valide_le           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on ouvrages (lot_id);
create index on ouvrages using gin (libelle_normalise gin_trgm_ops);
create index on ouvrages using hnsw (embedding vector_cosine_ops);


-- =====================================================================
-- COUCHE 3 — RATTACHEMENT
-- =====================================================================

create table rattachements (
  id               uuid primary key default gen_random_uuid(),
  ligne_source_id  uuid not null unique references lignes_source(id) on delete cascade,
  ouvrage_id       uuid not null references ouvrages(id) on delete restrict,

  score            numeric(4,3),               -- similarité cosinus ou score LLM
  methode          text not null,              -- 'embedding'|'llm'|'manuel'|'regle'
  valide           boolean not null default false,
  valide_par       text,
  valide_le        timestamptz,

  -- écarter une ligne aberrante des statistiques sans la supprimer
  exclu_agregats   boolean not null default false,
  motif_exclusion  text,

  created_at       timestamptz not null default now()
);

create index on rattachements (ouvrage_id);
create index on rattachements (valide);


-- =====================================================================
-- ACCES
-- =====================================================================

-- Pas de comptes : un code d'accès par personne, haché. Session côté serveur.
-- Donne la révocation individuelle et la traçabilité sans friction d'UX.
create table acces (
  id             uuid primary key default gen_random_uuid(),
  libelle        text not null,                -- "Métreur 1", "Direction"
  code_hash      text not null,
  actif          boolean not null default true,
  dernier_acces  timestamptz,
  created_at     timestamptz not null default now()
);

create table journal_acces (
  id         bigserial primary key,
  acces_id   uuid references acces(id),
  action     text,                             -- 'connexion'|'recherche'|'chat'|'export'
  detail     jsonb,
  created_at timestamptz not null default now()
);


-- =====================================================================
-- RLS
-- =====================================================================
-- Tout est fermé. L'app n'accède à la base que côté serveur (service role),
-- jamais depuis le navigateur. La clé service ne sort pas de Vercel.

alter table documents      enable row level security;
alter table lignes_source  enable row level security;
alter table ouvrages       enable row level security;
alter table rattachements  enable row level security;
alter table clients        enable row level security;
alter table acces          enable row level security;
alter table journal_acces  enable row level security;
