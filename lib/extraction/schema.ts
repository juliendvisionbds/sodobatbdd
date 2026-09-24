// =====================================================================
// SODOBAT — lib/extraction/schema.ts
// Contrat d'extraction des documents (devis / factures / situations).
// Reprise du contrat 03_extraction.ts du cadrage.
//
// Les PDF sont hétérogènes et l'ordre de lecture de la couche texte est
// souvent cassé : aucun parser positionnel. Le PDF natif part chez
// Claude (qui voit image + texte) ; les tableurs passent par SheetJS
// puis structuration par le même schéma.
// =====================================================================

import { z } from "zod";

// ---------------------------------------------------------------------
// Schéma de sortie
// ---------------------------------------------------------------------

// Champs tolérants : les attributs sont un bonus, une valeur mal typée
// (ex. "200" ou "20/25" pour un nombre) ne doit jamais faire échouer le
// document entier — elle est coercée, sinon mise à null.
const texteSouple = z
  .union([z.string(), z.number()])
  .nullable()
  .transform((v) => (v == null ? null : String(v)))
  .catch(null);
const nombreSouple = z.coerce.number().nullable().catch(null);
const booleenSouple = z.boolean().nullable().catch(null);

export const AttributsLigne = z
  .object({
    materiau: texteSouple,        // "acier", "béton", "grès cérame"
    profile: texteSouple,         // "IPN", "IPE", "HEA"
    section_mm: nombreSouple,     // 160  <- "IPN 160"
    longueur_m: nombreSouple,     // 2.5  <- "porté de mur en mur 2M50 environ"
    epaisseur_mm: nombreSouple,
    dimensions: texteSouple,      // "60x60"
    finition: texteSouple,
    marque: texteSouple,
    localisation: texteSouple,    // "façade", "terrasse", "murs béton"
    fourniture_incluse: booleenSouple, // "fourniture et pose" -> true
  })
  .partial();

export const LigneExtraite = z.object({
  ordre: z.number().int(),
  page: z.number().int(),

  // VERBATIM, fautes comprises. Ne jamais corriger ici : "Pacivation",
  // "ventillation", "provisoir" sont des données. La correction se fait
  // plus tard, dans le champ libelle_devis du référentiel.
  designation: z.string().min(1),

  unite_brute: z.string().nullable(),     // 'ens' | 'u' | 'U' | 'm2' ... tel qu'imprimé
  quantite: z.number().nullable(),
  pu_ht: z.number().nullable(),
  total_ht: z.number().nullable(),

  // Ligne de titre de section, sans prix. À ne pas confondre avec une
  // prestation dont le prix n'a pas été lu.
  est_titre: z.boolean().default(false),

  attributs: AttributsLigne.default({}),
  confiance: z.number().min(0).max(1),
});

export const DocumentExtrait = z.object({
  // Un devis a une durée de validité et une mention "bon pour accord".
  // Une facture a une échéance de paiement. Une situation renvoie à un
  // marché et n'a pas de détail de prestations.
  type_document: z.enum(["devis", "facture", "situation", "avenant", "indetermine"]),

  // Travaux supplémentaires : mention explicite "TS", "travaux
  // supplémentaires", "avenant n°", ou référence à un marché initial.
  est_ts: z.boolean(),
  indice_ts: z.string().nullable(),       // la mention qui a déclenché la détection

  numero_document: z.string().nullable(),
  date_document: z.string().nullable(),   // ISO. "FREJUS le 10/04/2026" -> "2026-04-10"

  client_nom: z.string().nullable(),
  client_code_postal: z.string().nullable(),
  client_commune: z.string().nullable(),

  chantier_objet: z.string().nullable(),  // la ligne "Objet : ..."
  // Renseigner UNIQUEMENT si une adresse de chantier distincte figure sur
  // le document. Ne jamais recopier l'adresse client ici : c'est ce qui
  // détermine si la moyenne par zone est fiable ou déduite.
  chantier_code_postal: z.string().nullable(),
  chantier_commune: z.string().nullable(),

  total_ht: z.number().nullable(),
  tva_taux: z.number().nullable(),
  total_ttc: z.number().nullable(),

  lignes: z.array(LigneExtraite),
  remarques: z.string().nullable(),       // ce que le modèle n'a pas su lire
});

export type DocumentExtrait = z.infer<typeof DocumentExtrait>;
export type LigneExtraite = z.infer<typeof LigneExtraite>;

// ---------------------------------------------------------------------
// Contrôles arithmétiques
//
// C'est le garde-fou principal. Sans structure fiable dans le PDF, c'est
// lui qui détecte les erreurs d'extraction — et il est quasi gratuit.
// ---------------------------------------------------------------------

const TOLERANCE_ABS = 0.02;
const TOLERANCE_REL = 0.005;

function proche(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(TOLERANCE_ABS, Math.abs(b) * TOLERANCE_REL);
}

export type Controle = "ok" | "ecart" | "non_verifiable";

export function controlerLigne(l: LigneExtraite): {
  statut: Controle;
  ecart: number | null;
} {
  if (l.est_titre) return { statut: "non_verifiable", ecart: null };
  if (l.quantite == null || l.pu_ht == null || l.total_ht == null) {
    return { statut: "non_verifiable", ecart: null };
  }
  const attendu = l.quantite * l.pu_ht;
  return proche(attendu, l.total_ht)
    ? { statut: "ok", ecart: 0 }
    : { statut: "ecart", ecart: +(l.total_ht - attendu).toFixed(2) };
}

export type ControleDocument = {
  lignes: Array<{ ligne: LigneExtraite; statut: Controle; ecart: number | null }>;
  controleTotal: Controle;
  ecartTotal: number | null;
  controleTva: Controle;
  lignesEnEcart: number;
  statut: "valide" | "a_revoir";
};

export function controlerDocument(d: DocumentExtrait): ControleDocument {
  const lignes = d.lignes.map((l) => ({ ligne: l, ...controlerLigne(l) }));

  const somme = d.lignes
    .filter((l) => !l.est_titre && l.total_ht != null)
    .reduce((s, l) => s + (l.total_ht ?? 0), 0);

  let controleTotal: Controle = "non_verifiable";
  let ecartTotal: number | null = null;
  if (d.total_ht != null) {
    controleTotal = proche(somme, d.total_ht) ? "ok" : "ecart";
    ecartTotal = +(somme - d.total_ht).toFixed(2);
  }

  let controleTva: Controle = "non_verifiable";
  if (d.total_ht != null && d.tva_taux != null && d.total_ttc != null) {
    controleTva = proche(d.total_ht * (1 + d.tva_taux / 100), d.total_ttc)
      ? "ok"
      : "ecart";
  }

  const lignesEnEcart = lignes.filter((l) => l.statut === "ecart").length;

  // Règle de tri : un document dont les totaux tombent juste est importable
  // sans relecture. Tout le reste part en file de revue humaine.
  // Un document de type indéterminé part toujours en revue (OS, marchés
  // signés, plannings... présents dans le lot initial).
  const statut =
    controleTotal === "ok" && lignesEnEcart === 0 && d.type_document !== "indetermine"
      ? "valide"
      : "a_revoir";

  return { lignes, controleTotal, ecartTotal, controleTva, lignesEnEcart, statut };
}

// ---------------------------------------------------------------------
// Prompt d'extraction
// ---------------------------------------------------------------------

export const VERSION_EXTRACTION = "2026-08-24.1";

export const PROMPT_EXTRACTION = `
Tu extrais les données d'un document commercial d'une entreprise de BTP française
(devis, facture, situation d'avancement, avenant, ou autre : ordre de service,
marché signé... -> type_document = "indetermine"). Un DPGF ou un bordereau de
prix rempli est un devis (type_document = "devis").

Règles impératives :

0. EXHAUSTIVITÉ DES PRESTATIONS. Extrais TOUTES les lignes de prestation du
   tableau, sans en sauter, sans résumer, sans regrouper. Un document de 200
   prestations doit produire 200 entrées dans "lignes". Une ligne manquante
   fausse toutes les statistiques en aval.
   MAIS : les lignes de SOUS-TOTAL, TOTAL, récapitulatif, TVA, remise
   globale, retenue de garantie ne sont PAS des prestations. Ne les mets
   JAMAIS dans "lignes" (ni comme prestation, ni comme titre) : elles
   servent uniquement à renseigner total_ht / tva_taux / total_ttc.
   Test : la somme des total_ht des lignes extraites doit égaler le
   total_ht du document — si tu inclus un sous-total, tu comptes double.

1. DESIGNATION VERBATIM. Recopie la désignation exactement telle qu'imprimée,
   fautes d'orthographe comprises. N'orthographie pas, ne reformule pas,
   n'abrège pas. Les fautes sont des données utiles au rapprochement.

2. UNITE BRUTE. Recopie l'unité telle qu'écrite ('ens', 'u', 'U', 'M2'...),
   sans la normaliser. La normalisation est faite en aval.

3. NOMBRES. Format français : la virgule est le séparateur décimal, l'espace
   le séparateur de milliers. "17 640,00" -> 17640.00.

4. LIGNES DE TITRE. Une ligne sans quantité ni prix qui introduit une section
   est un titre : est_titre = true. Ne lui invente pas de prix.
   Une prestation dont tu n'as pas réussi à lire le prix reste est_titre = false
   avec des champs null et une confiance basse.

5. ATTRIBUTS. Extrais dans "attributs" tout ce qui est chiffré ou qualifiant
   à l'intérieur de la désignation. Exemples :
   "Fourniture et pose d'IPN 160 porté de mur en mur 2M50 Environ"
     -> profile: "IPN", section_mm: 160, longueur_m: 2.5,
        materiau: "acier", fourniture_incluse: true
   "Fourniture et pose de sabot metalique chevillé dans les murs bétons"
     -> materiau: "acier", localisation: "murs béton", fourniture_incluse: true
   OMETS toute clé absente (pas de null) : {} pour une ligne sans attribut.
   N'invente jamais une valeur plausible.

6. CHANTIER vs CLIENT. Ne renseigne chantier_code_postal et chantier_commune
   que si une adresse de chantier DISTINCTE de l'adresse client figure sur le
   document. Sinon, laisse-les à null. Ne recopie jamais l'adresse du client
   dans les champs chantier.

7. TS. est_ts = true seulement sur mention explicite (travaux supplémentaires,
   TS, avenant, référence à un marché initial). Reporte la mention exacte
   dans indice_ts.

8. INCERTITUDE. Renseigne "confiance" honnêtement par ligne, et signale dans
   "remarques" tout ce que tu n'as pas su lire. Une valeur null est toujours
   préférable à une valeur devinée : le contrôle arithmétique en aval
   détectera l'erreur, mais il ne pourra pas la corriger.

9. PAGES. "page" = numéro de page du document (1 pour la première). Pour un
   tableur, mets 1 partout (ou le numéro de feuille si plusieurs feuilles).

Réponds uniquement avec le JSON conforme au schéma fourni. Aucun texte autour,
aucun bloc de code markdown.
`.trim();

// Schéma JSON transmis au modèle (résumé lisible, pas un JSON Schema strict :
// le garde-fou réel est DocumentExtrait.parse en aval).
export const SCHEMA_POUR_MODELE = `
{
  "type_document": "devis" | "facture" | "situation" | "avenant" | "indetermine",
  "est_ts": boolean,
  "indice_ts": string | null,
  "numero_document": string | null,
  "date_document": "AAAA-MM-JJ" | null,
  "client_nom": string | null,
  "client_code_postal": string | null,
  "client_commune": string | null,
  "chantier_objet": string | null,
  "chantier_code_postal": string | null,
  "chantier_commune": string | null,
  "total_ht": number | null,
  "tva_taux": number | null,
  "total_ttc": number | null,
  "lignes": [
    {
      "ordre": number, "page": number,
      "designation": string,
      "unite_brute": string | null,
      "quantite": number | null, "pu_ht": number | null, "total_ht": number | null,
      "est_titre": boolean,
      "attributs": { // UNIQUEMENT les clés présentes, {} sinon. Clés admises :
        "materiau", "profile", "section_mm", "longueur_m", "epaisseur_mm",
        "dimensions", "finition", "marque", "localisation", "fourniture_incluse"
      },
      "confiance": number (0 à 1)
    }
  ],
  "remarques": string | null
}
`.trim();
