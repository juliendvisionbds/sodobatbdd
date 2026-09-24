// =====================================================================
// SODOBAT — scripts/seed-structure.ts
// Seed STRUCTUREL uniquement : zones, communes, unités, lots, index de
// prix neutre. AUCUN ouvrage, AUCUN document, AUCUN client : la base ne
// contient que la charpente, les vraies données arrivent par /import.
//
//   npm run db:structure     (ré-exécutable : vide puis reconstruit)
//
// Index de prix : coefficient 1,0 sur toute la période, donc prix
// actualisés = prix bruts tant que l'index BT01 réel n'est pas importé.
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";
import {
  LOTS,
  ZONES,
  COMMUNES,
  UNITES,
  UNITES_ALIAS,
} from "../seed/referentiel";

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});

function moisNeutres(): string[] {
  const liste: string[] = [];
  for (let annee = 2018; annee <= new Date().getFullYear() + 2; annee++) {
    for (let m = 1; m <= 12; m++) {
      liste.push(`${annee}-${String(m).padStart(2, "0")}-01`);
    }
  }
  return liste;
}

async function main() {
  console.log("— Purge complète (documents, lignes, ouvrages, clients)…");
  await sql`truncate table journal_acces, rattachements, lignes_source,
    documents, clients_alias, clients, ouvrages, lots, unites_alias, unites,
    zones_communes, zones, index_prix restart identity cascade`;

  console.log("— Zones et communes…");
  const zoneIds = new Map<string, string>();
  for (const z of ZONES) {
    const [r] = await sql`insert into zones (code, libelle, ordre)
      values (${z.code}, ${z.libelle}, ${z.ordre}) returning id`;
    zoneIds.set(z.code, r.id as string);
  }
  for (const [cp, commune, zone] of COMMUNES) {
    await sql`insert into zones_communes (code_postal, commune, zone_id)
      values (${cp}, ${commune}, ${zoneIds.get(zone)!})
      on conflict do nothing`;
  }

  console.log("— Unités et alias…");
  for (const [code, libelle, forfaitaire, agregable] of UNITES) {
    await sql`insert into unites (code, libelle, est_forfaitaire, agregable)
      values (${code}, ${libelle}, ${forfaitaire}, ${agregable})`;
  }
  for (const [alias, code, facteur] of UNITES_ALIAS) {
    await sql`insert into unites_alias (alias, code_unite, facteur)
      values (${alias}, ${code}, ${facteur}) on conflict do nothing`;
  }

  console.log("— Lots…");
  const lotIds = new Map<string, string>();
  for (const l of LOTS) {
    const [r] = await sql`insert into lots (code, libelle, parent_id, ordre)
      values (${l.code}, ${l.libelle},
        ${l.parent ? lotIds.get(l.parent)! : null}, ${l.ordre})
      returning id`;
    lotIds.set(l.code, r.id as string);
  }

  console.log("— Index de prix neutre (coefficient 1,0)…");
  for (const mois of moisNeutres()) {
    await sql`insert into index_prix (mois, coefficient, source)
      values (${mois}, 1.0, 'neutre — à remplacer par BT01')`;
  }

  console.log("— Rafraîchissement des agrégats…");
  await sql`select rafraichir_agregats()`;

  const [compte] = await sql`select
    (select count(*)::int from zones) as zones,
    (select count(*)::int from zones_communes) as communes,
    (select count(*)::int from unites) as unites,
    (select count(*)::int from lots) as lots,
    (select count(*)::int from ouvrages) as ouvrages,
    (select count(*)::int from documents) as documents,
    (select count(*)::int from clients) as clients`;
  console.log("\n=== STRUCTURE EN PLACE ===");
  console.log(
    `${compte.zones} zones · ${compte.communes} communes · ${compte.unites} unités · ${compte.lots} lots`,
  );
  console.log(
    `ouvrages: ${compte.ouvrages} · documents: ${compte.documents} · clients: ${compte.clients} (attendu : 0 partout)`,
  );
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
