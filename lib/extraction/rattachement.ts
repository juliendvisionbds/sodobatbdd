// =====================================================================
// Construction du référentiel depuis les vraies lignes :
//   1. recherche d'un ouvrage existant par similarité trigramme ;
//   2. sinon, un passage LLM par document regroupe les désignations
//      proches et propose l'ouvrage canonique (libellé corrigé, libellé
//      normalisé, lot, unité).
// Tout est créé NON VALIDÉ : la file /calage (V/M/N) sert de validation
// humaine, puis rafraichir_agregats() recalcule les stats.
// =====================================================================

import { z } from "zod";
import { sql } from "@/lib/db";
import { appelerTexte } from "./appel-modele";

const SEUIL_OUVRAGE_TRIGRAMME = 0.45;

export type ResultatRattachement = {
  parTrigramme: number;
  parLlm: number;
  ouvragesCrees: number;
  lignesIgnorees: number;
};

// ---------------------------------------------------------------------
// Réponse attendue du LLM de regroupement
// ---------------------------------------------------------------------

// Champs tolérants : pour un ouvrage existant le modèle omet le reste.
const PropositionOuvrage = z.object({
  // soit un ouvrage existant (code), soit un nouveau
  ouvrage_code_existant: z.string().nullish().default(null),
  code: z.string().nullish().default(null),              // 'GO-IPN-160'
  libelle_normalise: z.string().nullish().default(null), // interne, minuscules
  libelle_devis: z.string().nullish().default(null),     // propre, imprimable
  lot: z.string().nullish().default(null),               // code lot existant
  unite: z.string().nullish().default(null),             // code unité existant
  est_forfaitaire: z
    .boolean()
    .nullish()
    .transform((v) => v ?? false),
  attributs_cles: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? {}),
  // numéros de lignes (1..N) tels que fournis dans la demande — des
  // entiers courts, fiables à recopier (les UUID ne le sont pas)
  lignes: z.array(z.union([z.number(), z.string()])),
});

const ReponseRegroupement = z.object({
  ouvrages: z.array(PropositionOuvrage),
  lignes_hors_perimetre: z
    .array(z.union([z.number(), z.string()]))
    .default([]),
});

const PROMPT_REGROUPEMENT = `
Tu construis le référentiel d'ouvrages d'une entreprise de gros œuvre du Var /
Alpes-Maritimes, à partir de lignes de devis réelles.

On te donne des lignes de devis numérotées (numéro, désignation verbatim avec
ses fautes, unité, attributs déjà extraits). Regroupe celles qui désignent LA
MÊME prestation au MÊME niveau de spécification, et propose pour chaque groupe
un ouvrage canonique :

- libelle_normalise : minuscules, sans faute, concis, sert au rapprochement
  automatique ("fourniture et pose ipn 160", "demolition dalle beton").
- libelle_devis : la formulation propre et imprimable sur un futur devis,
  fautes corrigées ("Fourniture et pose d'IPN 160, scellement compris").
- code : identifiant court lisible, préfixé par le lot ("GO-IPN-160",
  "DE-DALLE-BET"). Majuscules, chiffres et tirets uniquement.
- lot : le code de lot le plus adapté parmi la liste fournie.
- unite : le code d'unité de référence parmi la liste fournie.
- est_forfaitaire : true pour les frais de chantier (installation, amenée/
  repli, base vie, nettoyage, études, compte prorata...).
- attributs_cles : les attributs qui distinguent cet ouvrage d'un autre du
  même lot ({"profile":"IPN","section_mm":160}).

Règles :
1. Deux sections différentes (IPN 160 vs IPN 200) = deux ouvrages distincts.
2. Une même prestation avec des localisations différentes = UN seul ouvrage
   (la localisation reste un attribut de la ligne, pas de l'ouvrage).
3. Si une ligne correspond à un ouvrage EXISTANT fourni dans la liste,
   référence-le par ouvrage_code_existant au lieu d'en créer un nouveau.
4. Les lignes illisibles, trop vagues ("travaux divers") ou purement
   administratives (retenue de garantie, révision de prix, remise
   commerciale) vont dans lignes_hors_perimetre.
5. Chaque numéro de ligne fourni apparaît exactement une fois (dans un
   groupe ou dans lignes_hors_perimetre). Recopie les numéros tels quels,
   ce sont des entiers.

Réponds uniquement en JSON :
{
  "ouvrages": [
    {
      "ouvrage_code_existant": string | null,
      "code": string | null,
      "libelle_normalise": string | null,
      "libelle_devis": string | null,
      "lot": string | null,
      "unite": string | null,
      "est_forfaitaire": boolean,
      "attributs_cles": object,
      "lignes": [1, 4, 12]
    }
  ],
  "lignes_hors_perimetre": [7]
}
Pour un ouvrage existant, seuls ouvrage_code_existant et lignes sont requis.
Pour un nouveau, code, libelle_normalise, libelle_devis, lot et unite sont
requis (ouvrage_code_existant = null).
`.trim();

// ---------------------------------------------------------------------

async function creerRattachement(
  ligneId: string,
  ouvrageId: string,
  score: number | null,
  methode: "regle" | "llm",
): Promise<void> {
  await sql`insert into rattachements
    (ligne_source_id, ouvrage_id, score, methode, valide)
    values (${ligneId}, ${ouvrageId}, ${score}, ${methode}, false)
    on conflict (ligne_source_id) do nothing`;
}

async function codeUnique(souhait: string): Promise<string> {
  const base = souhait
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  for (let i = 0; i < 20; i++) {
    const candidat = i === 0 ? base : `${base}-${i + 1}`;
    const [existe] = await sql`select 1 from ouvrages where code = ${candidat}`;
    if (!existe) return candidat;
  }
  return `${base}-${Date.now()}`;
}

function extraireJson(texte: string): unknown {
  const nettoye = texte
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const debut = nettoye.indexOf("{");
  const fin = nettoye.lastIndexOf("}");
  if (debut < 0 || fin < debut) throw new Error("Réponse sans objet JSON.");
  return JSON.parse(nettoye.slice(debut, fin + 1));
}

// ---------------------------------------------------------------------
// Entrée principale : rattacher toutes les lignes d'un document
// ---------------------------------------------------------------------

export async function rattacherDocument(
  documentId: string,
  o: { seulementAvecPrix?: boolean } = {},
): Promise<ResultatRattachement> {
  const lignes = await sql`
    select l.id, l.designation_brute, l.unite_code, l.attributs
    from lignes_source l
    left join rattachements r on r.ligne_source_id = l.id
    where l.document_id = ${documentId}
      and l.est_titre = false
      and l.hors_perimetre = false
      and r.id is null
      ${o.seulementAvecPrix ? sql`and l.pu_ht > 0` : sql``}
    order by l.ordre`;

  const resultat: ResultatRattachement = {
    parTrigramme: 0,
    parLlm: 0,
    ouvragesCrees: 0,
    lignesIgnorees: 0,
  };
  if (lignes.length === 0) return resultat;

  // --- 1. Trigramme contre les ouvrages existants ----------------------
  const restantes: Array<(typeof lignes)[number]> = [];
  for (const ligne of lignes) {
    const [meilleur] = await sql`
      select id, similarity(f_unaccent(lower(libelle_normalise)),
                            f_unaccent(lower(${ligne.designation_brute}))) as score
      from ouvrages
      where actif = true
        and similarity(f_unaccent(lower(libelle_normalise)),
                       f_unaccent(lower(${ligne.designation_brute})))
            >= ${SEUIL_OUVRAGE_TRIGRAMME}
      order by score desc
      limit 1`;
    if (meilleur) {
      await creerRattachement(
        ligne.id as string,
        meilleur.id as string,
        +(+meilleur.score).toFixed(3),
        "regle",
      );
      resultat.parTrigramme++;
    } else {
      restantes.push(ligne);
    }
  }
  if (restantes.length === 0) return resultat;

  // --- 2. Regroupement LLM pour le reste, par lots de 80 lignes ---------
  const lots = await sql`select code, libelle from lots order by code`;
  const unites = await sql`select code from unites order by code`;
  const lotIdParCode = new Map(
    lots.map((l) => [l.code as string, l.id as string]),
  );
  const lotsComplets = await sql`select id, code from lots`;
  for (const l of lotsComplets) {
    lotIdParCode.set(l.code as string, l.id as string);
  }
  const unitesValides = new Set(unites.map((u) => u.code as string));

  const TAILLE_LOT = 80;
  for (let debut = 0; debut < restantes.length; debut += TAILLE_LOT) {
    const paquet = restantes.slice(debut, debut + TAILLE_LOT);

    // Rechargé à chaque paquet : le référentiel grandit au fil de l'eau.
    const existants = await sql`
      select code, libelle_normalise, unite_reference
      from ouvrages where actif = true and code is not null
      order by code limit 400`;

    const demande = [
      `Lots disponibles :\n${lots.map((l) => `- ${l.code} : ${l.libelle}`).join("\n")}`,
      `Unités disponibles : ${unites.map((u) => u.code).join(", ")}`,
      existants.length > 0
        ? `Ouvrages existants (réutilise-les si une ligne correspond) :\n${existants
            .map(
              (o) =>
                `- ${o.code} | ${o.libelle_normalise} | ${o.unite_reference ?? "?"}`,
            )
            .join("\n")}`
        : "Aucun ouvrage existant : tout est à créer.",
      `Lignes à traiter :\n${paquet
        .map(
          (l, i) =>
            `${i + 1}. ${l.designation_brute} | unité=${l.unite_code ?? "?"} | attributs=${JSON.stringify(l.attributs)}`,
        )
        .join("\n")}`,
    ].join("\n\n");

    const reponseTexte = await appelerTexte(PROMPT_REGROUPEMENT, demande);
    const reponse = ReponseRegroupement.parse(extraireJson(reponseTexte));

    // numéro (1..N) -> id de ligne du paquet
    const ligneParNumero = (v: number | string): string | null => {
      const n = typeof v === "number" ? v : parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1 || n > paquet.length) return null;
      return paquet[n - 1].id as string;
    };

    const horsPerimetre = reponse.lignes_hors_perimetre
      .map(ligneParNumero)
      .filter((id): id is string => id != null);
    resultat.lignesIgnorees += horsPerimetre.length;
    if (horsPerimetre.length > 0) {
      // mémorisé : ces lignes ne repasseront pas à chaque relance et
      // n'apparaissent pas dans la file « Sans ouvrage »
      await sql`update lignes_source
        set hors_perimetre = true, motif_hors_perimetre = 'llm'
        where id = any(${horsPerimetre})`;
    }

    for (const prop of reponse.ouvrages) {
      const lignesValides = prop.lignes
        .map(ligneParNumero)
        .filter((id): id is string => id != null);
      if (lignesValides.length === 0) continue;

      let ouvrageId: string | null = null;

      if (prop.ouvrage_code_existant) {
        const [existant] = await sql`
          select id from ouvrages where code = ${prop.ouvrage_code_existant}`;
        ouvrageId = (existant?.id as string) ?? null;
      }

      if (!ouvrageId) {
        if (!prop.libelle_normalise || !prop.libelle_devis) {
          resultat.lignesIgnorees += lignesValides.length;
          continue;
        }
        const code = await codeUnique(prop.code ?? prop.libelle_normalise);
        const lotId = prop.lot ? (lotIdParCode.get(prop.lot) ?? null) : null;
        const unite =
          prop.unite && unitesValides.has(prop.unite) ? prop.unite : null;
        const [cree] = await sql`insert into ouvrages
          (lot_id, code, libelle_normalise, libelle_devis, unite_reference,
           attributs_cles, est_forfaitaire, actif)
          values (${lotId}, ${code}, ${prop.libelle_normalise},
                  ${prop.libelle_devis}, ${unite},
                  ${sql.json(prop.attributs_cles as never)},
                  ${prop.est_forfaitaire}, true)
          returning id`;
        ouvrageId = cree.id as string;
        resultat.ouvragesCrees++;
      }

      for (const ligneId of lignesValides) {
        await creerRattachement(ligneId, ouvrageId, null, "llm");
        resultat.parLlm++;
      }
    }
  }

  return resultat;
}
