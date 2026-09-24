// =====================================================================
// Appels OpenAI pour l'extraction (gpt-5-mini par défaut : très bon en
// extraction structurée, ~10× moins cher que les grands modèles). Le
// chat de l'app reste sur Anthropic ; seule l'extraction passe ici.
//
// Deux chemins :
//   - appelerExtraction : synchrone (écran /import, relances) ;
//   - construireRequeteExtraction : corps de requête réutilisé tel quel
//     par le CLI de masse via la Batch API (-50 %).
// =====================================================================

import OpenAI from "openai";
import {
  DocumentExtrait,
  PROMPT_EXTRACTION,
  SCHEMA_POUR_MODELE,
} from "./schema";

export const MODELE_EXTRACTION =
  process.env.EXTRACTION_MODEL ?? "gpt-5-mini";

let client: OpenAI | null = null;
export function openai(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY manquante (.env.local).");
    }
    client = new OpenAI();
  }
  return client;
}

export type ContenuExtraction =
  | { type: "pdf"; nomFichier: string; base64: string }
  | { type: "texte"; texte: string };

const SYSTEME_EXTRACTION = `${PROMPT_EXTRACTION}\n\nSchéma JSON attendu :\n${SCHEMA_POUR_MODELE}`;

/**
 * Corps de requête chat.completions pour une extraction. Utilisé à
 * l'identique en synchrone et dans les fichiers JSONL de la Batch API.
 */
export function construireRequeteExtraction(
  contenu: ContenuExtraction,
): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
  const utilisateur: OpenAI.Chat.ChatCompletionContentPart[] =
    contenu.type === "pdf"
      ? [
          {
            type: "file",
            file: {
              filename: contenu.nomFichier,
              file_data: `data:application/pdf;base64,${contenu.base64}`,
            },
          },
          {
            type: "text",
            text: "Extrais ce document selon le schéma. L'ordre de lecture de la couche texte peut être faux : fie-toi à la mise en page visible pour la structure du tableau, et au texte pour la valeur exacte des nombres. Réponds en JSON.",
          },
        ]
      : [
          {
            type: "text",
            text: `Voici le contenu d'un tableur (une section par feuille, format CSV). Extrais le document selon le schéma, en JSON. Le champ "page" = numéro de feuille. Attention aux lignes de sous-total et de récapitulatif : ce ne sont ni des prestations ni des titres, ignore-les sauf pour vérifier les totaux du document.\n\n${contenu.texte}`,
          },
        ];

  return {
    model: MODELE_EXTRACTION,
    reasoning_effort: "low",
    max_completion_tokens: 100000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEME_EXTRACTION },
      { role: "user", content: utilisateur },
    ],
  };
}

export function extraireJson(texte: string): unknown {
  const nettoye = texte
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const debut = nettoye.indexOf("{");
  const fin = nettoye.lastIndexOf("}");
  if (debut < 0 || fin < debut) throw new Error("Réponse sans objet JSON.");
  return JSON.parse(nettoye.slice(debut, fin + 1));
}

/** Valide la réponse brute du modèle (partagé avec le CLI batch). */
export function validerReponseExtraction(texte: string): {
  extrait: DocumentExtrait;
  brut: unknown;
} {
  const brut = extraireJson(texte);
  const extrait = DocumentExtrait.parse(brut);
  return { extrait, brut };
}

/**
 * Extraction synchrone avec une retentative en cas de JSON non conforme
 * (l'erreur Zod est renvoyée au modèle en contexte).
 */
export async function appelerExtraction(
  contenu: ContenuExtraction,
): Promise<{ extrait: DocumentExtrait; brut: unknown }> {
  const requete = construireRequeteExtraction(contenu);
  const messages = [...requete.messages];

  let derniereErreur = "";
  for (let tentative = 0; tentative < 2; tentative++) {
    if (tentative > 0) {
      messages.push({
        role: "user",
        content: `Ta réponse précédente n'était pas conforme au schéma :\n${derniereErreur}\nRéponds à nouveau, uniquement le JSON.`,
      });
    }
    const reponse = await openai().chat.completions.create({
      ...requete,
      messages,
    });
    const texte = reponse.choices[0]?.message?.content ?? "";
    try {
      return validerReponseExtraction(texte);
    } catch (e) {
      derniereErreur = e instanceof Error ? e.message.slice(0, 2000) : String(e);
      messages.push({ role: "assistant", content: texte.slice(0, 60000) });
    }
  }
  throw new Error(`Extraction : JSON invalide après retentative — ${derniereErreur}`);
}

/** Appel texte générique (regroupement d'ouvrages). Réponse JSON. */
export async function appelerTexte(
  systeme: string,
  utilisateur: string,
): Promise<string> {
  const reponse = await openai().chat.completions.create({
    model: MODELE_EXTRACTION,
    reasoning_effort: "low",
    max_completion_tokens: 50000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systeme },
      { role: "user", content: utilisateur },
    ],
  });
  return reponse.choices[0]?.message?.content ?? "";
}
