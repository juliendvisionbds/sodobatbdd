// =====================================================================
// Applique les migrations db/*.sql dans l'ordre, une seule fois chacune.
//
//   npm run db:migrate
//
// Particularité locale : les binaires Postgres embarqués n'ont pas
// l'extension pgvector. Les colonnes embedding ne servent qu'au pipeline
// d'ingestion (hors périmètre de l'app) : si pgvector est absent, le
// schéma est adapté à la volée (vector(1536) -> text, index hnsw omis).
// Sur Supabase, pgvector est présent et le schéma s'applique tel quel.
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquante (.env.local).");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

function adapterSansPgvector(texte: string): string {
  return texte
    .split("\n")
    .filter(
      (l) =>
        !l.includes('create extension if not exists "vector"') &&
        !l.includes("using hnsw"),
    )
    .join("\n")
    .replace(/vector\(1536\)/g, "text");
}

async function main() {
  const [{ dispo }] = await sql`
    select count(*)::int > 0 as dispo
    from pg_available_extensions where name = 'vector'`;
  if (!dispo) {
    console.log("pgvector absent : colonnes embedding adaptées (dev local).");
  }

  await sql`create table if not exists _migrations (
    nom text primary key,
    applique_le timestamptz not null default now()
  )`;

  const fichiers = readdirSync(path.join(process.cwd(), "db"))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const fichier of fichiers) {
    const deja = await sql`select 1 from _migrations where nom = ${fichier}`;
    if (deja.length > 0) {
      console.log(`— ${fichier} déjà appliquée`);
      continue;
    }
    let texte = readFileSync(path.join(process.cwd(), "db", fichier), "utf8");
    if (!dispo) texte = adapterSansPgvector(texte);
    console.log(`→ ${fichier}`);
    await sql.unsafe(texte);
    await sql`insert into _migrations (nom) values (${fichier})`;
  }

  console.log("Migrations appliquées.");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
