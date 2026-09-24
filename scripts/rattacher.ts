// =====================================================================
// Rattachement de rattrapage, parallélisé :
//   npm run rattacher [-- --parallele P] [--avec-prix]
//
// --avec-prix : ne traite que les lignes ayant un prix unitaire (les
// lignes « pour mémoire » ne servent à aucune statistique).
//
// Traite tous les documents ayant des lignes sans rattachement
// (interruption, échec ponctuel, import par batch). Idempotent :
// relançable à volonté. P documents de front (défaut 4) — le référentiel
// est rechargé à chaque paquet, le risque de doublon d'ouvrage est
// faible et se corrige dans /calage.
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const idx = process.argv.indexOf("--parallele");
  const parallele = Math.max(1, idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 4);
  const seulementAvecPrix = process.argv.includes("--avec-prix");

  const { rattacherDocument } = await import("../lib/extraction/rattachement");
  const { rafraichirAgregats } = await import("../lib/extraction/pipeline");
  const { sql } = await import("../lib/db");

  const docs = await sql`
    select d.id, d.fichier_nom, count(l.id)::int as orphelines
    from documents d
    join lignes_source l on l.document_id = d.id and l.est_titre = false
      and l.hors_perimetre = false
      ${seulementAvecPrix ? sql`and l.pu_ht > 0` : sql``}
    left join rattachements r on r.ligne_source_id = l.id
    where r.id is null and d.statut <> 'rejete'
    group by d.id, d.fichier_nom
    order by count(l.id) asc`;

  console.log(`${docs.length} document(s) avec lignes à rattacher\n`);

  let fait = 0;
  let ouvragesCrees = 0;
  let rattaches = 0;
  const echecs: string[] = [];

  let curseur = 0;
  async function travailleur() {
    while (curseur < docs.length) {
      const doc = docs[curseur++];
      try {
        const r = await rattacherDocument(doc.id as string, { seulementAvecPrix });
        fait++;
        ouvragesCrees += r.ouvragesCrees;
        rattaches += r.parTrigramme + r.parLlm;
        console.log(
          `[${fait}/${docs.length}] ${doc.fichier_nom} : ` +
            `${r.parTrigramme} similarité + ${r.parLlm} LLM, ` +
            `${r.ouvragesCrees} ouvrage(s) créé(s)` +
            (r.lignesIgnorees ? `, ${r.lignesIgnorees} hors périmètre` : ""),
        );
      } catch (e) {
        fait++;
        const message = e instanceof Error ? e.message : String(e);
        echecs.push(`${doc.fichier_nom} : ${message.slice(0, 200)}`);
        console.log(`[${fait}/${docs.length}] ✗ ${doc.fichier_nom}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(parallele, docs.length) }, travailleur),
  );

  console.log("\n— Rafraîchissement des agrégats…");
  await rafraichirAgregats();

  console.log(`\nRattachements créés : ${rattaches} · Ouvrages créés : ${ouvragesCrees}`);
  if (echecs.length > 0) {
    console.log("Échecs (relancer la même commande) :");
    for (const e of echecs) console.log(`  - ${e}`);
  }

  const [compte] = await sql`select
    (select count(*)::int from ouvrages) as ouvrages,
    (select count(*)::int from rattachements where valide = false) as a_valider,
    (select count(*)::int from lignes_source l
       left join rattachements r on r.ligne_source_id = l.id
       where l.est_titre = false and r.id is null
         and l.hors_perimetre = false and l.pu_ht > 0) as orphelines`;
  console.log(
    `Base : ${compte.ouvrages} ouvrages · ${compte.a_valider} à valider · ` +
      `${compte.orphelines} ligne(s) encore orpheline(s)`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
