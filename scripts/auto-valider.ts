// =====================================================================
// Auto-validation des rattachements :
//   npm run auto-valider -- [--dry-run] [--seuil 0.8] [--llm] [--annuler]
//
// --annuler : remet en attente TOUT ce qui a été validé automatiquement
// (valide_par auto / auto-llm), en une fois.
//
// Mode par défaut : valide les propositions « par règle » dont le score
// de similarité est ≥ seuil et dont l'unité concorde (valide_par='auto').
//
// --llm : pour chaque ouvrage ayant ≥ 2 propositions en attente, demande
// au modèle quelles lignes NE désignent PAS cette prestation ; le reste
// est validé (valide_par='auto-llm'), les lignes écartées restent en file
// manuelle. Tout est journalisé et annulable depuis /calage (touche Z).
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { z } from "zod";

const PROMPT_VERIFICATION = `
Tu vérifies le rattachement de lignes de devis de gros œuvre à des
ouvrages canoniques. Pour chaque ouvrage, on te donne son libellé, son
unité, et des lignes numérotées (désignation verbatim, unité, prix
unitaire) qu'un premier passage a proposé de lui rattacher.

Indique, par ouvrage, les numéros des lignes qui NE désignent PAS cette
prestation au même niveau de spécification :
- une section, une épaisseur, un diamètre, un dosage différents = à écarter
  (IPN 160 ≠ IPN 200, voile 20 ≠ voile 25) ;
- une localisation différente (RDC, R+1, façade sud) = même ouvrage, à garder ;
- une formulation différente de la même prestation = à garder ;
- une ligne administrative, un sous-total, un titre = à écarter.
Dans le doute, écarte : une ligne écartée sera relue par un humain, une
ligne mal validée fausse un prix.

Réponds uniquement en JSON :
{ "ouvrages": [ { "code": "GO-IPN-160", "ecartees": [3, 7] } ] }
Chaque ouvrage fourni apparaît une fois, avec une liste (éventuellement vide).
`.trim();

const Reponse = z.object({
  ouvrages: z.array(
    z.object({
      code: z.string(),
      ecartees: z.array(z.union([z.number(), z.string()])).default([]),
    }),
  ),
});

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const modeLlm = args.includes("--llm");
  const idx = args.indexOf("--seuil");
  const seuil = idx >= 0 ? parseFloat(args[idx + 1]) : 0.8;

  const referentiel = await import("../lib/queries/referentiel");
  const { rafraichirAgregats } = await import("../lib/extraction/pipeline");
  const { sql } = await import("../lib/db");

  if (args.includes("--annuler")) {
    const ids = await sql`select id from rattachements
      where valide and valide_par in ('auto', 'auto-llm')`;
    const n = dryRun
      ? ids.length
      : await referentiel.devaliderRattachements(ids.map((r) => r.id as string), { rafraichir: false });
    console.log(`${dryRun ? "[simulation] " : ""}${n} validation(s) automatique(s) remise(s) en attente`);
  } else if (!modeLlm) {
    const bilan = await referentiel.autoValiderRattachements({
      seuil,
      dryRun,
      rafraichir: false,
    });
    console.log(
      `${dryRun ? "[simulation] " : ""}Seuil ${seuil} · candidats : ${bilan.candidats} · validés : ${bilan.valides}`,
    );
    console.log("\nPar ouvrage (10 premiers) :");
    for (const o of bilan.parOuvrage.slice(0, 10)) {
      console.log(`  ${String(o.n).padStart(4)}  ${o.libelleDevis}`);
    }
  } else {
    const { appelerTexte, extraireJson } = await import("../lib/extraction/appel-modele");
    const groupes = await referentiel.ouvragesAValider(2);
    console.log(`${groupes.length} ouvrage(s) avec ≥ 2 propositions en attente`);

    const TAILLE = 20;
    let valides = 0;
    let ecartees = 0;
    for (let debut = 0; debut < groupes.length; debut += TAILLE) {
      const paquet = groupes.slice(debut, debut + TAILLE);
      const demande = paquet
        .map(
          (g) =>
            `### ${g.ouvrage.code ?? g.ouvrage.id} | ${g.ouvrage.libelleDevis} | unité=${g.ouvrage.unite ?? "?"}\n` +
            g.lignes
              .map(
                (l, i) =>
                  `${i + 1}. ${l.designation} | unité=${l.unite ?? "?"} | PU=${l.pu ?? "?"}`,
              )
              .join("\n"),
        )
        .join("\n\n");

      let reponse: z.infer<typeof Reponse>;
      try {
        reponse = Reponse.parse(extraireJson(await appelerTexte(PROMPT_VERIFICATION, demande)));
      } catch (e) {
        console.log(`  ✗ paquet ${debut / TAILLE + 1} : ${e instanceof Error ? e.message.slice(0, 120) : e}`);
        continue;
      }
      const parCode = new Map(reponse.ouvrages.map((o) => [o.code, o.ecartees]));

      for (const g of paquet) {
        const cle = g.ouvrage.code ?? g.ouvrage.id;
        const numeros = parCode.get(cle);
        if (numeros === undefined) {
          console.log(`  ? ${g.ouvrage.libelleDevis} : absent de la réponse, ignoré`);
          continue;
        }
        const exclure = numeros
          .map((n) => (typeof n === "number" ? n : parseInt(n, 10)))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= g.lignes.length)
          .map((n) => g.lignes[n - 1].rattachementId);
        // unité incompatible : toujours laissée à l'humain
        for (const l of g.lignes) if (!l.uniteCompatible) exclure.push(l.rattachementId);
        const aValider = g.lignes.length - new Set(exclure).size;
        ecartees += new Set(exclure).size;
        if (dryRun) {
          valides += aValider;
          console.log(`  ${String(aValider).padStart(4)} / ${String(g.lignes.length).padStart(4)}  ${g.ouvrage.libelleDevis}`);
          continue;
        }
        const r = await referentiel.validerParOuvrage(g.ouvrage.id, {
          exclureIds: [...new Set(exclure)],
          acteur: "auto-llm",
          action: "auto-llm",
          rafraichir: false,
        });
        valides += r.ids.length;
        console.log(`  ${String(r.ids.length).padStart(4)} / ${String(g.lignes.length).padStart(4)}  ${g.ouvrage.libelleDevis}`);
      }
    }
    console.log(
      `\n${dryRun ? "[simulation] " : ""}Validées : ${valides} · laissées en file manuelle : ${ecartees}`,
    );
  }

  if (!dryRun) {
    console.log("\n— Rafraîchissement des agrégats…");
    await rafraichirAgregats();
  }
  const [c] = await sql`select
    (select count(*)::int from rattachements where valide) as valides,
    (select count(*)::int from rattachements where valide = false) as en_attente,
    (select count(distinct ouvrage_id)::int from v_lignes_agregables) as ouvrages_avec_prix`;
  console.log(
    `Base : ${c.valides} validés · ${c.en_attente} en attente · ${c.ouvrages_avec_prix} ouvrages avec prix`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
