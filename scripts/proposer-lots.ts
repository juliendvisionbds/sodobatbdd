// =====================================================================
// Arborescence de lots proposée par l'IA :
//   npm run proposer-lots -- [--dry-run] [--echantillon 40]
//
// 1. Taxonomie : à partir des lots actuels et d'un échantillon d'ouvrages
//    par lot, le modèle propose des sous-lots (2 niveaux max).
// 2. Affectation : chaque ouvrage est rangé dans un lot existant ou
//    proposé, par paquets de 150.
// Rien n'est appliqué : tout va dans lots_proposes / ouvrages_lots_proposes,
// à valider dans /calage → Lots.
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { z } from "zod";

const PROMPT_TAXONOMIE = `
Tu organises le référentiel d'ouvrages d'une entreprise de bâtiment (gros
œuvre principalement, aussi tous corps d'état). On te donne les lots
actuels (code, libellé, parent) et, pour chacun, un échantillon d'ouvrages
(code | libellé | unité).

Propose une arborescence à DEUX niveaux maximum (lot > sous-lot) qui
permettrait à un métreur de retrouver un ouvrage en deux clics et de
structurer un devis :
- conserve les lots racine existants (ne les renomme pas) ;
- propose des sous-lots là où un lot mélange des natures différentes
  (ex. GO.BA → dalles et planchers, voiles et murs, poutres et poteaux,
  fondations, ferraillage, béton en fourniture) ;
- 4 à 10 sous-lots par lot racine chargé, aucun pour un lot homogène ;
- codes en majuscules, préfixés par le code du parent et un point
  ("GO.BA.DAL"), libellés courts en français ;
- un motif d'une phrase par sous-lot.

Réponds uniquement en JSON :
{ "lots": [ { "code": "GO.BA.DAL", "libelle": "Dalles et planchers",
              "parent_code": "GO.BA", "ordre": 1, "motif": "…" } ] }
`.trim();

const PROMPT_AFFECTATION = `
Tu ranges des ouvrages de bâtiment dans une arborescence de lots. On te
donne la liste des lots possibles (code : libellé) et des ouvrages
(code | libellé | unité). Pour chaque ouvrage, choisis le lot le plus
précis qui convient (un sous-lot plutôt que son parent quand il existe).
Si aucun lot ne convient vraiment, prends le lot racine le plus proche.

Réponds uniquement en JSON :
{ "affectations": [ { "code": "GO-DAL-20", "lot": "GO.BA.DAL" } ] }
Chaque ouvrage fourni apparaît exactement une fois.
`.trim();

const Taxonomie = z.object({
  lots: z.array(
    z.object({
      code: z.string(),
      libelle: z.string(),
      parent_code: z.string().nullable(),
      ordre: z.number().int().default(0),
      motif: z.string().nullish().default(null),
    }),
  ),
});
const Affectation = z.object({
  affectations: z.array(z.object({ code: z.string(), lot: z.string() })),
});

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const idx = args.indexOf("--echantillon");
  const echantillon = idx >= 0 ? parseInt(args[idx + 1], 10) : 40;

  const { sql } = await import("../lib/db");
  const referentiel = await import("../lib/queries/referentiel");
  const { appelerTexte, extraireJson } = await import("../lib/extraction/appel-modele");

  const lots = await sql`select code, libelle, (select code from lots p where p.id = l.parent_id) as parent
    from lots l order by ordre, code`;
  const codesRacine = new Set(lots.filter((l) => !l.parent).map((l) => l.code as string));

  // --- 1. taxonomie ---------------------------------------------------
  const blocs: string[] = [];
  for (const l of lots) {
    const ex = await sql`select code, libelle_normalise, unite_reference from ouvrages
      where actif and lot_id = (select id from lots where code = ${l.code})
      order by random() limit ${echantillon}`;
    blocs.push(
      `### ${l.code} : ${l.libelle}${l.parent ? ` (sous-lot de ${l.parent})` : ""} — ${ex.length} ouvrage(s) en échantillon\n` +
        ex.map((o) => `${o.code ?? "?"} | ${o.libelle_normalise} | ${o.unite_reference ?? "?"}`).join("\n"),
    );
  }
  const [sansLot] = await sql`select count(*)::int as n from ouvrages where actif and lot_id is null`;
  console.log(`${lots.length} lot(s) existants · ${sansLot.n} ouvrage(s) sans lot`);

  const taxo = Taxonomie.parse(extraireJson(await appelerTexte(PROMPT_TAXONOMIE, blocs.join("\n\n"))));
  const existants = new Set(lots.map((l) => l.code as string));
  const proposes = taxo.lots
    .map((l) => ({
      code: l.code.trim().toUpperCase(),
      libelle: l.libelle.trim(),
      parentCode: l.parent_code?.trim().toUpperCase() || null,
      ordre: l.ordre,
      motif: l.motif ?? undefined,
    }))
    .filter((l) => /^[A-Z0-9.]{2,20}$/.test(l.code) && !existants.has(l.code))
    .filter((l) => !l.parentCode || existants.has(l.parentCode) || taxo.lots.some((x) => x.code.toUpperCase() === l.parentCode));
  console.log(`\nSous-lots proposés : ${proposes.length}`);
  for (const p of proposes) console.log(`  ${p.code.padEnd(14)} ${p.libelle}  ← ${p.parentCode ?? "racine"}`);

  // --- 2. affectation --------------------------------------------------
  const choix = [
    ...lots.map((l) => `${l.code} : ${l.libelle}`),
    ...proposes.map((p) => `${p.code} : ${p.libelle} (proposé)`),
  ].join("\n");
  const codesValides = new Set([...existants, ...proposes.map((p) => p.code)]);
  const ouvrages = await sql`select id, code, libelle_normalise, unite_reference from ouvrages
    where actif order by lot_id nulls first, code`;
  const parCode = new Map(ouvrages.filter((o) => o.code).map((o) => [o.code as string, o.id as string]));
  const affectations: Array<{ ouvrageId: string; lotCode: string }> = [];
  const TAILLE = 150;
  for (let debut = 0; debut < ouvrages.length; debut += TAILLE) {
    const paquet = ouvrages.slice(debut, debut + TAILLE).filter((o) => o.code);
    const demande =
      `Lots possibles :\n${choix}\n\nOuvrages :\n` +
      paquet.map((o) => `${o.code} | ${o.libelle_normalise} | ${o.unite_reference ?? "?"}`).join("\n");
    try {
      // une réponse mal formée arrive parfois : on redemande une fois
      let rep: z.infer<typeof Affectation>;
      try {
        rep = Affectation.parse(extraireJson(await appelerTexte(PROMPT_AFFECTATION, demande)));
      } catch {
        rep = Affectation.parse(extraireJson(await appelerTexte(PROMPT_AFFECTATION, demande)));
      }
      for (const a of rep.affectations) {
        const id = parCode.get(a.code);
        const lot = a.lot.trim().toUpperCase();
        if (id && codesValides.has(lot)) affectations.push({ ouvrageId: id, lotCode: lot });
      }
      process.stdout.write(`\r  affectations : ${affectations.length} / ${ouvrages.length}`);
    } catch (e) {
      console.log(`\n  ✗ paquet ${debut / TAILLE + 1} : ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }
  console.log("");
  void codesRacine;

  const parLot = new Map<string, number>();
  for (const a of affectations) parLot.set(a.lotCode, (parLot.get(a.lotCode) ?? 0) + 1);
  console.log("\nRépartition proposée :");
  for (const [code, n] of [...parLot.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${code}`);
  }

  if (dryRun) {
    console.log("\n[simulation] rien n'est enregistré.");
  } else {
    await referentiel.enregistrerPropositionLots(proposes, affectations);
    console.log(`\nEnregistré : ${proposes.length} sous-lot(s) et ${affectations.length} affectation(s) à valider dans /calage → Lots.`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
