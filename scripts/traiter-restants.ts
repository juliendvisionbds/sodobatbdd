// Traite ponctuellement les fichiers passés en argument (depuis
// public/devis), en réutilisant la ligne d'import laissée par un run
// interrompu. Rattachement différé (npm run rattacher).
//   npx tsx scripts/traiter-restants.ts "DEVIS.xls" "Trame ....xlsx"

import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const noms = process.argv.slice(2);
  const { traiterFichier } = await import("../lib/extraction/pipeline");
  const { sql } = await import("../lib/db");
  const { readFileSync } = await import("node:fs");

  for (const nom of noms) {
    const [imp] = await sql`select id from imports where fichier_nom = ${nom}
      and statut in ('extraction', 'erreur')
      order by created_at desc limit 1`;
    const r = await traiterFichier(
      nom,
      readFileSync(`public/devis/${nom}`),
      imp?.id as string | undefined,
      { rattacher: false },
    );
    console.log(
      `${nom} -> ${r.statut} ${r.nbLignes ?? ""} ${r.statutDocument ?? ""} ${r.erreur ?? ""}`,
    );
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
