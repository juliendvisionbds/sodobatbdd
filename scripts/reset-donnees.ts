// =====================================================================
// Purge des DONNÉES MÉTIER uniquement (documents, lignes, ouvrages,
// clients, imports). La structure reste : zones, communes, unités,
// lots, index de prix, codes d'accès.
//
//   npm run db:reset-donnees
//
// À lancer avant un chargement complet pour repartir d'un référentiel
// propre (ex. : après des essais de calibrage).
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});

async function main() {
  await sql`truncate table rattachements, lignes_source, documents,
    clients_alias, clients, ouvrages, imports restart identity cascade`;
  await sql`select rafraichir_agregats()`;
  const [compte] = await sql`select
    (select count(*)::int from zones) as zones,
    (select count(*)::int from lots) as lots,
    (select count(*)::int from acces) as acces`;
  console.log("Données métier purgées (documents, ouvrages, clients, imports).");
  console.log(
    `Structure conservée : ${compte.zones} zones · ${compte.lots} lots · ${compte.acces} accès.`,
  );
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
