// =====================================================================
// Propositions de fusion d'ouvrages (quasi-doublons du référentiel) :
//   npm run proposer-fusions -- [--seuil 0.6] [--embeddings] [--seuil-embedding 0.92]
//                               [--sans-llm] [--dry-run]
//
// --embeddings : calcule les embeddings manquants des ouvrages (OpenAI),
// puis ajoute les paires proches par sens (cosinus ≥ seuil-embedding).
// Ignoré sur une base sans pgvector (dev local).
//
// 1. Paires d'ouvrages actifs proches par trigramme (même unité, même
//    nature) → table fusions_proposees.
// 2. Sauf --sans-llm : le modèle qualifie chaque paire (même prestation
//    au même niveau de spécification ?). « distinct » → refusée d'office,
//    le reste est revu dans /calage → Doublons.
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { z } from "zod";

const PROMPT_FUSION = `
Tu cures le référentiel d'ouvrages d'une entreprise de gros œuvre. On te
donne des paires d'ouvrages jugés proches par similarité de libellé, avec
pour chacun son libellé, son unité, ses attributs et quelques désignations
de devis réelles qui lui sont rattachées.

Pour chaque paire, dis si les deux ouvrages désignent LA MÊME prestation
au MÊME niveau de spécification :
- "meme" : même prestation, seuls la formulation ou la localisation
  changent (fusion souhaitable) ;
- "distinct" : section, épaisseur, diamètre, dosage, matériau ou nature
  différents (IPN 160 vs IPN 200, voile 20 vs 25, dalle vs chape) ;
- "incertain" : impossible à trancher sur ces éléments.
Donne un motif court (une phrase).

Réponds uniquement en JSON :
{ "paires": [ { "id": "<id fourni>", "avis": "meme" | "distinct" | "incertain", "motif": "…" } ] }
`.trim();

const Reponse = z.object({
  paires: z.array(
    z.object({
      id: z.string(),
      avis: z.enum(["meme", "distinct", "incertain"]),
      motif: z.string().nullish().default(null),
    }),
  ),
});

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sansLlm = args.includes("--sans-llm");
  const idx = args.indexOf("--seuil");
  const seuil = idx >= 0 ? parseFloat(args[idx + 1]) : 0.6;

  const referentiel = await import("../lib/queries/referentiel");
  const { sql } = await import("../lib/db");

  if (dryRun) {
    const [c] = await sql`
      select count(*)::int as n
      from ouvrages a join ouvrages b on a.id < b.id
      where a.actif and b.actif
        and a.est_forfaitaire = b.est_forfaitaire
        and a.unite_reference is not distinct from b.unite_reference
        and similarity(a.libelle_normalise, b.libelle_normalise) >= ${seuil}`;
    console.log(`[simulation] ${c.n} paire(s) candidates au seuil ${seuil}`);
    await sql.end();
    return;
  }

  const nouvelles = await referentiel.genererPropositionsFusion({ seuil });
  console.log(`${nouvelles} nouvelle(s) proposition(s) par trigramme au seuil ${seuil}`);

  if (args.includes("--embeddings")) {
    const idxE = args.indexOf("--seuil-embedding");
    const seuilE = idxE >= 0 ? parseFloat(args[idxE + 1]) : 0.92;
    if (!(await referentiel.pgvectorDisponible())) {
      console.log("pgvector absent : étape embeddings ignorée.");
    } else {
      const { calculerEmbeddings, texteEmbeddingOuvrage } = await import("../lib/extraction/embeddings");
      let total = 0;
      for (;;) {
        const lot = await referentiel.ouvragesSansEmbedding(100);
        if (lot.length === 0) break;
        const vecteurs = await calculerEmbeddings(lot.map(texteEmbeddingOuvrage));
        await referentiel.enregistrerEmbeddings(lot.map((o, i) => ({ id: o.id, embedding: vecteurs[i] })));
        total += lot.length;
        process.stdout.write(`\r  embeddings calculés : ${total}`);
      }
      if (total > 0) console.log("");
      const parSens = await referentiel.genererPropositionsFusionEmbedding({ seuil: seuilE });
      console.log(`${parSens} nouvelle(s) proposition(s) par sens au seuil ${seuilE}`);
    }
  }

  if (!sansLlm) {
    const { appelerTexte, extraireJson } = await import("../lib/extraction/appel-modele");
    const aQualifier = await sql`
      select f.id, f.source_id, f.cible_id from fusions_proposees f
      where f.statut = 'proposee' and f.avis_llm is null`;
    console.log(`${aQualifier.length} paire(s) à qualifier par le modèle`);

    const decrire = async (id: string) => {
      const [o] = await sql`select code, libelle_devis, libelle_normalise, unite_reference, attributs_cles
        from ouvrages where id = ${id}`;
      const ex = await sql`select l.designation_brute from rattachements r
        join lignes_source l on l.id = r.ligne_source_id
        where r.ouvrage_id = ${id} limit 3`;
      return `${o.code ?? "?"} | ${o.libelle_devis} | unité=${o.unite_reference ?? "?"} | attributs=${JSON.stringify(o.attributs_cles)}\n      ex. : ${ex.map((e) => `« ${e.designation_brute} »`).join(" · ") || "—"}`;
    };

    const TAILLE = 40;
    const bilan = { meme: 0, distinct: 0, incertain: 0 };
    for (let debut = 0; debut < aQualifier.length; debut += TAILLE) {
      const paquet = aQualifier.slice(debut, debut + TAILLE);
      const blocs: string[] = [];
      for (const p of paquet) {
        blocs.push(
          `id=${p.id}\n  A : ${await decrire(p.source_id as string)}\n  B : ${await decrire(p.cible_id as string)}`,
        );
      }
      let reponse: z.infer<typeof Reponse>;
      try {
        reponse = Reponse.parse(extraireJson(await appelerTexte(PROMPT_FUSION, blocs.join("\n\n"))));
      } catch (e) {
        console.log(`  ✗ paquet ${debut / TAILLE + 1} : ${e instanceof Error ? e.message.slice(0, 120) : e}`);
        continue;
      }
      for (const r of reponse.paires) {
        if (!paquet.some((p) => p.id === r.id)) continue;
        await referentiel.qualifierFusion(r.id, r.avis, r.motif ?? null);
        bilan[r.avis]++;
      }
    }
    console.log(`Avis du modèle : ${bilan.meme} même · ${bilan.distinct} distinct (refusées) · ${bilan.incertain} incertain`);
  }

  const [c] = await sql`select
    count(*) filter (where statut = 'proposee')::int as a_revoir,
    count(*) filter (where statut = 'refusee')::int as refusees,
    count(*) filter (where statut = 'acceptee')::int as acceptees
    from fusions_proposees`;
  console.log(`Propositions : ${c.a_revoir} à revoir dans /calage → Doublons · ${c.refusees} refusées · ${c.acceptees} acceptées`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
