// =====================================================================
// Dates manquantes des pièces :
//   npm run db:dates -- [--dry-run]
//
// Pour chaque pièce sans date : relit la date brute de l'extraction
// (raw_json), puis le nom du fichier. Ce qui reste passe par le
// formulaire « Informations de la pièce » du calage.
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { sql } = await import("../lib/db");
  const { parserDateFrancaise, dateDepuisNomFichier } = await import("../lib/extraction/dates");
  const { rafraichirAgregats } = await import("../lib/extraction/pipeline");

  const docs = await sql`
    select id, fichier_nom, raw_json->>'date_document' as brut
    from documents where date_document is null order by created_at`;
  console.log(`${docs.length} pièce(s) sans date\n`);

  let trouvees = 0;
  for (const d of docs) {
    const parRaw = parserDateFrancaise(d.brut as string | null);
    const date = parRaw ?? dateDepuisNomFichier(d.fichier_nom as string);
    const source = parRaw ? "raw" : date ? "fichier" : null;
    console.log(
      `${date ? date + " (" + source + ")" : "—             "}  ${d.fichier_nom}`,
    );
    if (date && !dryRun) {
      await sql`update documents set date_document = ${date}, date_source = ${source},
        updated_at = now() where id = ${d.id}`;
    }
    if (date) trouvees++;
  }
  console.log(`\n${dryRun ? "[simulation] " : ""}${trouvees} date(s) retrouvée(s) · ${docs.length - trouvees} à saisir à la main`);
  if (!dryRun && trouvees > 0) await rafraichirAgregats();
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
