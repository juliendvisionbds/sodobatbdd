// =====================================================================
// Récupération des résultats d'un batch OpenAI déjà terminé :
//   npx tsx scripts/recuperer-batch.ts <batch_id> [<batch_id> ...]
//
// Utile quand le CLI d'import a été interrompu après l'envoi du batch :
// les résultats sont conservés chez OpenAI, les lignes `imports` (statut
// 'extraction') portent le custom_id. On insère sans rien repayer.
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const batchIds = process.argv.slice(2).filter((a) => a.startsWith("batch_"));
  if (batchIds.length === 0) {
    console.error("Usage : npx tsx scripts/recuperer-batch.ts <batch_id> ...");
    process.exit(1);
  }

  const { openai, validerReponseExtraction } = await import(
    "../lib/extraction/appel-modele"
  );
  const { insererDocument } = await import("../lib/extraction/insertion");
  const { cheminStorage } = await import("../lib/extraction/pipeline");
  const { compterPages } = await import("../lib/extraction/pdf");
  const { readFileSync, existsSync } = await import("node:fs");
  const { sql } = await import("../lib/db");

  const client = openai();
  const bilan = { insere: 0, erreur: 0, ignore: 0 };

  for (const batchId of batchIds) {
    const batch = await client.batches.retrieve(batchId);
    console.log(`Batch ${batchId} : ${batch.status}`);
    if (!batch.output_file_id) {
      console.log("  (pas de fichier de sortie, ignoré)");
      continue;
    }
    const texte = await (await client.files.content(batch.output_file_id)).text();

    for (const ligne of texte.split("\n")) {
      if (!ligne.trim()) continue;
      const objet = JSON.parse(ligne);
      const importId = objet.custom_id as string;

      const [imp] = await sql`
        select id, fichier_nom, fichier_hash, statut
        from imports where id = ${importId}`;
      if (!imp) {
        bilan.ignore++;
        continue;
      }
      if (imp.statut === "insere") {
        bilan.ignore++;
        continue;
      }

      const nom = imp.fichier_nom as string;
      const hash = imp.fichier_hash as string;
      try {
        const contenuReponse =
          objet.response?.body?.choices?.[0]?.message?.content;
        if (!contenuReponse) {
          throw new Error(
            `Réponse batch vide (HTTP ${objet.response?.status_code}).`,
          );
        }
        const { extrait, brut } = validerReponseExtraction(contenuReponse);

        // nb de pages recalculé depuis le fichier local s'il est encore là
        const cheminLocal = `public/devis/${nom}`;
        const nbPages =
          nom.toLowerCase().endsWith(".pdf") && existsSync(cheminLocal)
            ? compterPages(readFileSync(cheminLocal))
            : null;

        const insertion = await insererDocument({
          extrait,
          brut,
          fichierNom: nom,
          fichierHash: hash,
          storagePath: cheminStorage(hash, nom),
          nbPages,
        });
        bilan.insere++;
        await sql`update imports set statut = 'insere',
          document_id = ${insertion.documentId},
          bilan = ${sql.json({
            nbLignes: insertion.nbLignes,
            nbLignesEcart: insertion.nbLignesEcart,
            statutDocument: insertion.statut,
          } as never)},
          message_erreur = null, updated_at = now()
          where id = ${importId}`;
        console.log(
          `  ✓ ${nom} : ${insertion.nbLignes} lignes, ${insertion.statut}`,
        );
      } catch (e) {
        bilan.erreur++;
        const message = e instanceof Error ? e.message : String(e);
        await sql`update imports set statut = 'erreur',
          message_erreur = ${message.slice(0, 1000)}, updated_at = now()
          where id = ${importId}`;
        console.log(`  ✗ ${nom} : ${message.slice(0, 160)}`);
      }
    }
  }

  console.log(
    `\nInsérés : ${bilan.insere} · Échecs : ${bilan.erreur} · Ignorés (déjà faits) : ${bilan.ignore}`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
