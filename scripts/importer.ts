// =====================================================================
// Import de masse :
//   npm run import -- <dossier> [--max N] [--direct] [--parallele P]
//
// Mode par défaut : Batch API OpenAI (-50 %, traitement parallèle côté
// OpenAI). Déroulé :
//   1. hash + dédoublonnage + dépôt Storage + ligne `imports` par fichier
//   2. requêtes JSONL -> batches (découpés en ~80 Mo) -> attente
//   3. insertion des résultats (contrôles arithmétiques, clients, zones)
//   4. rattachement aux ouvrages, séquentiel (le référentiel se
//      construit au fil de l'eau, sans doublons dus à la concurrence)
// Reprenable : relancer ignore les fichiers déjà importés (hash).
//
// --direct : même pipeline que l'écran /import, appels synchrones.
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type Meta = {
  importId: string;
  nom: string;
  hash: string;
  chemin: string;
  nbPages: number | null;
};

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const dossier = args[0];
  if (!dossier) {
    console.error(
      "Usage : npm run import -- <dossier> [--max N] [--direct] [--parallele P]",
    );
    process.exit(1);
  }
  const lireOption = (nom: string, defaut: number): number => {
    const idx = process.argv.indexOf(`--${nom}`);
    return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : defaut;
  };
  const max = lireOption("max", Infinity);
  const direct = process.argv.includes("--direct");
  const parallele = Math.max(1, lireOption("parallele", 3));

  // Imports dynamiques après le chargement de l'environnement.
  const { traiterFichier, rafraichirAgregats, formatAccepte, cheminStorage } =
    await import("../lib/extraction/pipeline");
  const { rattacherDocument } = await import("../lib/extraction/rattachement");
  const { openai, construireRequeteExtraction, validerReponseExtraction } =
    await import("../lib/extraction/appel-modele");
  const { contenuPdf, compterPages } = await import("../lib/extraction/pdf");
  const { contenuTableur, extraireTableur } = await import(
    "../lib/extraction/tableur"
  );
  const { insererDocument } = await import("../lib/extraction/insertion");
  const { deposerFichier } = await import("../lib/stockage");
  const { sql } = await import("../lib/db");
  const { createHash } = await import("node:crypto");
  const OpenAI = (await import("openai")).default;

  const fichiers = readdirSync(dossier)
    .filter((f) => !f.startsWith(".") && statSync(path.join(dossier, f)).isFile())
    .filter((f) => formatAccepte(f))
    .sort((a, b) => a.localeCompare(b, "fr"))
    .slice(0, max);

  const bilan = { insere: 0, valide: 0, aRevoir: 0, doublon: 0, erreur: 0 };
  const erreurs: Array<{ fichier: string; erreur: string }> = [];
  const aRattacher: Array<{ nom: string; documentId: string }> = [];
  const debut = Date.now();

  const TYPES_MIME: Record<string, string> = {
    pdf: "application/pdf",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
  };

  // =====================================================================
  // MODE DIRECT (séquentiel/parallèle, appels synchrones)
  // =====================================================================
  if (direct) {
    console.log(
      `${fichiers.length} fichier(s), mode direct (${parallele} de front)\n`,
    );
    let curseur = 0;
    let traites = 0;
    async function travailleur() {
      while (curseur < fichiers.length) {
        const nom = fichiers[curseur++];
        const contenu = readFileSync(path.join(dossier, nom));
        const r = await traiterFichier(nom, contenu, undefined, {
          rattacher: false,
        });
        traites++;
        const tete = `[${traites}/${fichiers.length}]`;
        if (r.statut === "doublon") {
          bilan.doublon++;
          if (r.documentId) aRattacher.push({ nom, documentId: r.documentId });
          console.log(`${tete} — ${nom} : doublon`);
        } else if (r.statut === "erreur") {
          bilan.erreur++;
          erreurs.push({ fichier: nom, erreur: r.erreur ?? "?" });
          console.log(`${tete} ✗ ${nom} : ${(r.erreur ?? "").slice(0, 200)}`);
        } else {
          bilan.insere++;
          if (r.statutDocument === "valide") bilan.valide++;
          else bilan.aRevoir++;
          aRattacher.push({ nom, documentId: r.documentId! });
          console.log(
            `${tete} ✓ ${nom} : ${r.nbLignes} lignes, ${r.statutDocument}`,
          );
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(parallele, fichiers.length) }, travailleur),
    );
  } else {
    // ===================================================================
    // MODE BATCH (défaut)
    // ===================================================================
    console.log(`${fichiers.length} fichier(s), mode Batch API\n`);
    console.log("— Préparation (hash, dédoublonnage, dépôt Storage)…");

    const metas = new Map<string, Meta>();
    const lignesJsonl: Array<{ importId: string; ligne: string; octets: number }> =
      [];
    // Gros tableurs (plusieurs segments) : traités en synchrone pendant
    // que le batch tourne côté OpenAI.
    const grosTableurs: Array<Meta & { contenu: Buffer }> = [];

    for (const nom of fichiers) {
      const contenu = readFileSync(path.join(dossier, nom));
      const hash = createHash("sha256").update(contenu).digest("hex");

      const [doublon] = await sql`
        select id from documents where fichier_hash = ${hash}`;
      if (doublon) {
        bilan.doublon++;
        aRattacher.push({ nom, documentId: doublon.id as string });
        continue;
      }

      const ext = nom.split(".").pop()!.toLowerCase();
      const chemin = cheminStorage(hash, nom);
      try {
        await deposerFichier(chemin, contenu, TYPES_MIME[ext]);
        const [rec] = await sql`insert into imports
          (fichier_nom, fichier_hash, taille_octets, statut)
          values (${nom}, ${hash}, ${contenu.length}, 'extraction')
          returning id`;
        const importId = rec.id as string;
        const meta: Meta = {
          importId,
          nom,
          hash,
          chemin,
          nbPages: ext === "pdf" ? compterPages(contenu) : null,
        };
        try {
          const requete = construireRequeteExtraction(
            ext === "pdf" ? contenuPdf(contenu, nom) : contenuTableur(contenu),
          );
          metas.set(importId, meta);
          const ligne = JSON.stringify({
            custom_id: importId,
            method: "POST",
            url: "/v1/chat/completions",
            body: requete,
          });
          lignesJsonl.push({ importId, ligne, octets: Buffer.byteLength(ligne) });
        } catch (e) {
          if (e instanceof Error && e.message === "TABLEUR_SEGMENTE") {
            grosTableurs.push({ ...meta, contenu });
          } else {
            throw e;
          }
        }
      } catch (e) {
        bilan.erreur++;
        const message = e instanceof Error ? e.message : String(e);
        erreurs.push({ fichier: nom, erreur: message });
        console.log(`  ✗ ${nom} : ${message.slice(0, 200)}`);
      }
    }

    console.log(
      `  ${lignesJsonl.length} via batch, ${grosTableurs.length} gros tableur(s) ` +
        `en direct, ${bilan.doublon} doublon(s) ignoré(s)`,
    );

    if (lignesJsonl.length > 0 || grosTableurs.length > 0) {
      // Découpage en lots : la Batch API accepte 200 Mo par fichier, on
      // reste sous ~80 Mo par prudence.
      const OCTETS_MAX = 80_000_000;
      const lots: Array<typeof lignesJsonl> = [];
      let courant: typeof lignesJsonl = [];
      let octets = 0;
      for (const l of lignesJsonl) {
        if (courant.length > 0 && octets + l.octets > OCTETS_MAX) {
          lots.push(courant);
          courant = [];
          octets = 0;
        }
        courant.push(l);
        octets += l.octets;
      }
      if (courant.length > 0) lots.push(courant);

      const client = openai();
      const batches: Array<{ id: string; importIds: string[] }> = [];
      for (const [i, lot] of lots.entries()) {
        const corps = lot.map((l) => l.ligne).join("\n");
        const fichierBatch = await client.files.create({
          file: await OpenAI.toFile(Buffer.from(corps), `sodobat-import-${i}.jsonl`),
          purpose: "batch",
        });
        const batch = await client.batches.create({
          input_file_id: fichierBatch.id,
          endpoint: "/v1/chat/completions",
          completion_window: "24h",
        });
        batches.push({ id: batch.id, importIds: lot.map((l) => l.importId) });
        console.log(
          `— Batch ${i + 1}/${lots.length} envoyé (${lot.length} fichiers, ` +
            `${(corps.length / 1e6).toFixed(1)} Mo) : ${batch.id}`,
        );
      }

      // --- Gros tableurs en direct (pendant que le batch tourne) ---------
      for (const gros of grosTableurs) {
        try {
          console.log(`— Gros tableur : ${gros.nom} (extraction par segments)…`);
          const { extrait, brut } = await extraireTableur(gros.contenu);
          const insertion = await insererDocument({
            extrait,
            brut,
            fichierNom: gros.nom,
            fichierHash: gros.hash,
            storagePath: gros.chemin,
            nbPages: null,
          });
          bilan.insere++;
          if (insertion.statut === "valide") bilan.valide++;
          else bilan.aRevoir++;
          aRattacher.push({ nom: gros.nom, documentId: insertion.documentId });
          await sql`update imports set statut = 'insere',
            document_id = ${insertion.documentId},
            bilan = ${sql.json({
              nbLignes: insertion.nbLignes,
              nbLignesEcart: insertion.nbLignesEcart,
              statutDocument: insertion.statut,
            } as never)},
            message_erreur = null, updated_at = now()
            where id = ${gros.importId}`;
          console.log(
            `  ✓ ${gros.nom} : ${insertion.nbLignes} lignes, ${insertion.statut}`,
          );
        } catch (e) {
          bilan.erreur++;
          const message = e instanceof Error ? e.message : String(e);
          erreurs.push({ fichier: gros.nom, erreur: message });
          await sql`update imports set statut = 'erreur',
            message_erreur = ${message.slice(0, 1000)}, updated_at = now()
            where id = ${gros.importId}`;
          console.log(`  ✗ ${gros.nom} : ${message.slice(0, 200)}`);
        }
      }

      // --- Attente des batches ------------------------------------------
      console.log("\n— Attente des résultats (interrogation toutes les 30 s)…");
      const TIMEOUT_MS = 3 * 60 * 60 * 1000;
      const enAttente = new Set(batches.map((b) => b.id));
      const resultats = new Map<string, { contenu?: string; erreur?: string }>();

      while (enAttente.size > 0) {
        if (Date.now() - debut > TIMEOUT_MS) {
          console.error(
            `Délai dépassé. Batches encore en cours : ${[...enAttente].join(", ")}\n` +
              "Relancer le script plus tard : les fichiers déjà traités seront des doublons.",
          );
          break;
        }
        await new Promise((r) => setTimeout(r, 30_000));
        for (const b of batches) {
          if (!enAttente.has(b.id)) continue;
          const etat = await client.batches.retrieve(b.id);
          const compteurs = etat.request_counts;
          process.stdout.write(
            `  ${b.id} : ${etat.status}` +
              (compteurs ? ` (${compteurs.completed}/${compteurs.total} ok, ${compteurs.failed} échec(s))` : "") +
              "\n",
          );
          if (["completed", "failed", "expired", "cancelled"].includes(etat.status)) {
            enAttente.delete(b.id);
            if (etat.output_file_id) {
              const texte = await (await client.files.content(etat.output_file_id)).text();
              for (const ligne of texte.split("\n")) {
                if (!ligne.trim()) continue;
                const objet = JSON.parse(ligne);
                const contenuReponse =
                  objet.response?.body?.choices?.[0]?.message?.content;
                resultats.set(objet.custom_id, {
                  contenu: contenuReponse ?? undefined,
                  erreur: contenuReponse
                    ? undefined
                    : `Réponse vide (statut HTTP ${objet.response?.status_code}).`,
                });
              }
            }
            if (etat.error_file_id) {
              const texte = await (await client.files.content(etat.error_file_id)).text();
              for (const ligne of texte.split("\n")) {
                if (!ligne.trim()) continue;
                const objet = JSON.parse(ligne);
                resultats.set(objet.custom_id, {
                  erreur: objet.error?.message ?? JSON.stringify(objet.error).slice(0, 500),
                });
              }
            }
            if (etat.status !== "completed") {
              for (const id of b.importIds) {
                if (!resultats.has(id)) {
                  resultats.set(id, { erreur: `Batch ${etat.status}.` });
                }
              }
            }
          }
        }
      }

      // --- Insertion des résultats ---------------------------------------
      console.log("\n— Insertion des documents…");
      let i = 0;
      for (const [importId, meta] of metas) {
        i++;
        const tete = `[${i}/${metas.size}]`;
        const resultat = resultats.get(importId);
        const echouer = async (message: string) => {
          bilan.erreur++;
          erreurs.push({ fichier: meta.nom, erreur: message });
          await sql`update imports set statut = 'erreur',
            message_erreur = ${message.slice(0, 1000)}, updated_at = now()
            where id = ${importId}`;
          console.log(`${tete} ✗ ${meta.nom} : ${message.slice(0, 160)}`);
        };

        if (!resultat) {
          await echouer("Aucun résultat renvoyé par le batch.");
          continue;
        }
        if (!resultat.contenu) {
          await echouer(resultat.erreur ?? "Erreur batch inconnue.");
          continue;
        }
        try {
          const { extrait, brut } = validerReponseExtraction(resultat.contenu);
          const insertion = await insererDocument({
            extrait,
            brut,
            fichierNom: meta.nom,
            fichierHash: meta.hash,
            storagePath: meta.chemin,
            nbPages: meta.nbPages,
          });
          bilan.insere++;
          if (insertion.statut === "valide") bilan.valide++;
          else bilan.aRevoir++;
          aRattacher.push({ nom: meta.nom, documentId: insertion.documentId });
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
            `${tete} ✓ ${meta.nom} : ${insertion.nbLignes} lignes, ${insertion.statut}` +
              (insertion.nbLignesEcart ? `, ${insertion.nbLignesEcart} écart(s)` : ""),
          );
        } catch (e) {
          await echouer(e instanceof Error ? e.message : String(e));
        }
      }
    }
  }

  // =====================================================================
  // Passe finale : rattachement séquentiel + agrégats + bilan
  // =====================================================================
  console.log(`\n— Rattachement de ${aRattacher.length} document(s)…`);
  let ouvragesCrees = 0;
  let rattaches = 0;
  const echecsRattachement: string[] = [];
  for (const [i, doc] of aRattacher.entries()) {
    try {
      const r = await rattacherDocument(doc.documentId);
      ouvragesCrees += r.ouvragesCrees;
      rattaches += r.parTrigramme + r.parLlm;
      if (r.parTrigramme + r.parLlm > 0) {
        console.log(
          `[${i + 1}/${aRattacher.length}] ${doc.nom} : ` +
            `${r.parTrigramme} par similarité, ${r.parLlm} par LLM, ` +
            `${r.ouvragesCrees} ouvrage(s) créé(s)`,
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      echecsRattachement.push(`${doc.nom} : ${message.slice(0, 200)}`);
      console.log(`[${i + 1}/${aRattacher.length}] ✗ ${doc.nom} : rattachement échoué`);
    }
  }

  console.log("\n— Rafraîchissement des agrégats…");
  await rafraichirAgregats();

  const minutes = ((Date.now() - debut) / 60000).toFixed(1);
  console.log(`\n=== BILAN (${minutes} min) ===`);
  console.log(
    `Insérés   : ${bilan.insere} (${bilan.valide} validés, ${bilan.aRevoir} à revoir)`,
  );
  console.log(`Doublons  : ${bilan.doublon}`);
  console.log(`Échecs    : ${bilan.erreur}`);
  console.log(`Rattachements créés : ${rattaches} · Ouvrages créés : ${ouvragesCrees}`);
  if (erreurs.length > 0) {
    console.log("\nFichiers en échec :");
    for (const e of erreurs) console.log(`  - ${e.fichier}\n    ${e.erreur.slice(0, 300)}`);
  }
  if (echecsRattachement.length > 0) {
    console.log("\nRattachements en échec (rattrapables par relance) :");
    for (const e of echecsRattachement) console.log(`  - ${e}`);
  }

  const [compte] = await sql`select
    (select count(*)::int from documents) as documents,
    (select count(*)::int from lignes_source) as lignes,
    (select count(*)::int from ouvrages) as ouvrages,
    (select count(*)::int from clients) as clients,
    (select count(*)::int from rattachements where valide = false) as a_valider`;
  console.log(
    `\nBase : ${compte.documents} documents · ${compte.lignes} lignes · ` +
      `${compte.ouvrages} ouvrages · ${compte.clients} clients · ` +
      `${compte.a_valider} rattachements à valider (/calage)`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
