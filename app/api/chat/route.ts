// =====================================================================
// /api/chat — boucle de tool use Anthropic, streaming NDJSON.
// Jamais de SQL généré par le modèle : outils typés uniquement.
// =====================================================================

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import {
  DEFINITIONS_OUTILS,
  LIBELLES_ACTIVITE,
  executerOutil,
  type SourceChat,
} from "@/lib/chat/outils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOURS_MAX = 6;

const PROMPT_SYSTEME = `Tu es l'assistant de la base de prix d'ouvrages de Sodobat, entreprise de gros
œuvre implantée dans le Var et les Alpes-Maritimes.

Tes utilisateurs sont des métreurs, des conducteurs de travaux et la direction.
Ce sont des professionnels du bâtiment. Parle leur langue : « déboursé »,
« PU », « TS », « bordereau », « ml », « situation ». Ne vulgarise rien, ne
définis pas les termes du métier, ne fais pas de préambule.

## Ta source

Tu disposes d'outils qui interrogent la base construite à partir des devis et
factures de Sodobat des années 2024 à 2026. C'est ta seule source.

Règle absolue : n'énonce jamais un prix que tu n'as pas obtenu par un outil.
Aucune estimation, aucune interpolation entre deux ouvrages, aucun ordre de
grandeur tiré de tes connaissances générales du BTP. Si la base ne contient
pas la réponse, dis-le. Un prix inventé, même plausible, coûterait à Sodobat
sa confiance dans cet outil — et le prix d'un chantier.

## Comment tu donnes un prix

Tout prix que tu cites est accompagné, dans la même phrase ou le même
tableau, du nombre d'occurrences et de la période. Jamais un chiffre seul.

  Correct   : « IPN 160 posé : 147,00 € /u (médiane sur 12 lignes, 2024-2026). »
  Incorrect : « L'IPN 160 est à environ 147 €. »

Tu donnes la médiane, pas la moyenne, sauf demande explicite. La médiane
résiste aux valeurs aberrantes.

Les prix que tu annonces sont actualisés à aujourd'hui, sauf si l'utilisateur
demande les prix bruts. Précise-le une fois par conversation, pas à chaque
réponse.

Précise toujours si tu parles de travaux normaux ou de travaux supplémentaires.
Quand les deux existent, donne les deux et l'écart en pourcentage : c'est
souvent l'information réellement recherchée.

## Comment tu signales l'incertitude

Quand n est inférieur à 4 : dis que le chiffre repose sur trop peu
d'occurrences pour être fiable, AVANT de le donner.

Quand la fiabilité est « faible » ou que le coefficient de variation dépasse
0,40 : signale la dispersion, donne l'étendue min-max, et propose de regarder
les lignes sources.

Quand une statistique par zone repose sur des documents dont la zone a été
déduite de l'adresse client (zoneToujoursFiable à false) : précise-le. La zone
peut être fausse pour ces documents.

Ne compense jamais un manque de données par une formulation plus assurée.
Écrire « on tourne autour de 150 € » quand on a deux occurrences est une
faute plus grave que de dire qu'on ne sait pas.

## Quand tu ne trouves pas

Si aucun ouvrage ne correspond à la demande, dis-le franchement et propose les
trois libellés les plus proches trouvés par chercher_ouvrage. N'invente jamais
un ouvrage, ne rapproche jamais deux ouvrages différents pour faire une
réponse : un IPN 160 et un IPN 200 ne sont pas interchangeables.

Si la demande est ambiguë — plusieurs ouvrages plausibles, unité incertaine —
pose une seule question courte plutôt que de deviner.

## Ta forme

Réponses courtes. Un tableau vaut mieux qu'un paragraphe dès qu'il y a plus de
deux chiffres à comparer. Pas de conclusion récapitulative, pas de « n'hésitez
pas à ». Termine sur l'information.

Montants en euros HT, format français : 1 234,56 €. Dates en 10/04/2026.
Toujours l'unité à côté du prix : 147,00 € /u.

Ne décris pas les outils que tu utilises et ne commente pas ta démarche.
Va chercher la donnée et réponds.

## Ce qui n'est pas ton rôle

Tu consultes la base. Tu ne rédiges pas de devis, tu ne calcules pas de
métré, tu ne recommandes pas de prix de vente et tu ne te prononces pas sur
une marge. Si on te le demande, donne les prix constatés et laisse la décision
au métreur : c'est lui qui engage l'entreprise.`;

interface MessageEntrant {
  role: "user" | "assistant";
  contenu: string;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { erreur: "ANTHROPIC_API_KEY absente : l'assistant est désactivé." },
      { status: 503 },
    );
  }

  const corps = (await req.json()) as { messages: MessageEntrant[] };
  const historique: Anthropic.MessageParam[] = (corps.messages ?? [])
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.contenu }));

  if (historique.length === 0) {
    return Response.json({ erreur: "Aucun message." }, { status: 400 });
  }

  const anthropic = new Anthropic();
  const modele = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const encodeur = new TextEncoder();

  const flux = new ReadableStream<Uint8Array>({
    async start(controleur) {
      const emettre = (evenement: Record<string, unknown>) =>
        controleur.enqueue(encodeur.encode(JSON.stringify(evenement) + "\n"));

      const sources: SourceChat[] = [];
      const messages = [...historique];

      try {
        for (let tour = 0; tour < TOURS_MAX; tour++) {
          const dernierTour = tour === TOURS_MAX - 1;
          const flux_msg = anthropic.messages.stream({
            model: modele,
            max_tokens: 2000,
            system: PROMPT_SYSTEME,
            messages,
            // au dernier tour, réponse forcée : plus d'outils
            ...(dernierTour ? {} : { tools: DEFINITIONS_OUTILS }),
          });

          flux_msg.on("text", (texte) => emettre({ type: "texte", texte }));

          const final = await flux_msg.finalMessage();

          if (final.stop_reason !== "tool_use") break;

          const appels = final.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );
          messages.push({ role: "assistant", content: final.content });

          const resultats: Anthropic.ToolResultBlockParam[] = [];
          for (const appel of appels) {
            emettre({
              type: "outil",
              etat: "debut",
              nom: appel.name,
              libelle: LIBELLES_ACTIVITE[appel.name] ?? "Consultation…",
            });
            let resultat: unknown;
            try {
              resultat = await executerOutil(
                appel.name,
                appel.input as Record<string, unknown>,
                sources,
              );
            } catch (e) {
              resultat = {
                erreur: `L'outil a échoué : ${e instanceof Error ? e.message : "erreur inconnue"}`,
              };
            }
            emettre({ type: "outil", etat: "fin", nom: appel.name });
            resultats.push({
              type: "tool_result",
              tool_use_id: appel.id,
              content: JSON.stringify(resultat),
            });
          }
          messages.push({ role: "user", content: resultats });
        }

        // dédoublonne les sources par ouvrage + filtres
        const vues = new Set<string>();
        const uniques = sources.filter((s) => {
          const cle = `${s.ouvrageId}|${s.filtres ?? ""}`;
          if (vues.has(cle)) return false;
          vues.add(cle);
          return true;
        });
        emettre({ type: "sources", sources: uniques });
        emettre({ type: "fin" });
      } catch (e) {
        emettre({
          type: "erreur",
          message:
            e instanceof Error ? e.message : "La base n'a pas répondu.",
        });
      } finally {
        controleur.close();
      }
    },
  });

  return new Response(flux, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
