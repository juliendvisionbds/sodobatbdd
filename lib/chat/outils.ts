// =====================================================================
// Outils du chat — typés, branchés sur lib/queries. Jamais de SQL
// généré par le modèle : chaque outil est une fonction fermée.
// =====================================================================

import type Anthropic from "@anthropic-ai/sdk";
import { ouvrages, historique, referentiel } from "../queries";
import {
  valeurs,
  type CodeUnite,
  type CodeZone,
  type FiltresPrix,
  type StatsPrix,
  type TypeTravaux,
} from "../types";

// ---------------------------------------------------------------------
// Sources affichées sous la réponse
// ---------------------------------------------------------------------

export interface SourceChat {
  ouvrageId: string;
  libelle: string;
  n: number;
  periode: string;
  filtres: string | null;
}

// ---------------------------------------------------------------------
// Définitions (schéma Anthropic)
// ---------------------------------------------------------------------

const ZONES = ["06", "MERCANTOUR", "TOULON", "83_AUTRE"];
const UNITES = ["m2", "ml", "m3", "u", "kg", "h", "j", "ens", "forfait"];

export const DEFINITIONS_OUTILS: Anthropic.Tool[] = [
  {
    name: "chercher_ouvrage",
    description:
      "Recherche floue d'ouvrages canoniques dans le référentiel (par libellé ou code). Retourne pour chacun le n d'occurrences et la médiane actualisée globale.",
    input_schema: {
      type: "object",
      properties: {
        requete: { type: "string", description: "Terme de recherche" },
        lot: { type: "string", description: "Code de lot pour restreindre (ex. CM)" },
        unite: { type: "string", enum: UNITES },
        limite: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["requete"],
    },
  },
  {
    name: "stats_ouvrage",
    description:
      "Statistiques de prix d'un ouvrage : n, min, max, moyenne, médiane, quartiles, coefficient de variation, fiabilité, période. Filtrable par type de travaux, zone et dates.",
    input_schema: {
      type: "object",
      properties: {
        ouvrage_id: { type: "string" },
        est_ts: {
          type: "boolean",
          description: "true = travaux supplémentaires seulement, false = normaux seulement, absent = tous",
        },
        zone: { type: "string", enum: ZONES },
        depuis: { type: "string", description: "AAAA-MM-JJ" },
        jusqu_a: { type: "string", description: "AAAA-MM-JJ" },
        indexe: {
          type: "boolean",
          description: "true (défaut) = prix actualisés à aujourd'hui, false = prix bruts",
        },
      },
      required: ["ouvrage_id"],
    },
  },
  {
    name: "comparer_ouvrages",
    description:
      "Tableau comparatif de plusieurs ouvrages selon une dimension : par zone, par type de travaux (normaux vs TS), ou par année.",
    input_schema: {
      type: "object",
      properties: {
        ouvrage_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        dimension: { type: "string", enum: ["zone", "type", "annee"] },
      },
      required: ["ouvrage_ids", "dimension"],
    },
  },
  {
    name: "chercher_client",
    description:
      "Recherche floue d'un client (tolérante aux fautes de frappe). Retourne le nombre de documents et le total cumulé.",
    input_schema: {
      type: "object",
      properties: { requete: { type: "string" } },
      required: ["requete"],
    },
  },
  {
    name: "documents_client",
    description: "Liste des documents (devis, factures…) d'un client donné.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        depuis: { type: "string" },
        jusqu_a: { type: "string" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "lignes_document",
    description:
      "Toutes les lignes brutes d'un document, verbatim, avec quantités, PU et totaux.",
    input_schema: {
      type: "object",
      properties: { document_id: { type: "string" } },
      required: ["document_id"],
    },
  },
  {
    name: "cooccurrences",
    description:
      "Ouvrages qui apparaissent le plus souvent dans les mêmes documents qu'un ouvrage donné (taux de co-occurrence, ratio de quantités).",
    input_schema: {
      type: "object",
      properties: {
        ouvrage_id: { type: "string" },
        limite: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["ouvrage_id"],
    },
  },
];

export const LIBELLES_ACTIVITE: Record<string, string> = {
  chercher_ouvrage: "Recherche des ouvrages…",
  stats_ouvrage: "Lecture des statistiques…",
  comparer_ouvrages: "Comparaison des ouvrages…",
  chercher_client: "Recherche du client…",
  documents_client: "Lecture des documents…",
  lignes_document: "Lecture des lignes…",
  cooccurrences: "Lecture des co-occurrences…",
};

// ---------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------

function resumeStats(s: StatsPrix | null, indexe: boolean) {
  if (!s || s.n === 0) return null;
  const v = valeurs(s, indexe);
  return {
    n: s.n,
    n_chantiers: s.nChantiers,
    min: v.min,
    max: v.max,
    moyenne: v.moyenne,
    mediane: v.mediane,
    p25: v.quartiles?.p25 ?? null,
    p75: v.quartiles?.p75 ?? null,
    cv: s.coefVariation,
    fiabilite: s.fiabilite,
    periode: `${s.premiereOccurrence} → ${s.derniereOccurrence}`,
    zone_toujours_fiable: s.zoneToujoursFiable,
    prix: indexe ? "actualisés à aujourd'hui" : "bruts (non actualisés)",
  };
}

function periodeDe(s: StatsPrix): string {
  const annee = (d: string) => d.slice(0, 4);
  const a1 = annee(s.premiereOccurrence);
  const a2 = annee(s.derniereOccurrence);
  return a1 === a2 ? a1 : `${a1}-${a2}`;
}

interface Args {
  [cle: string]: unknown;
}

export async function executerOutil(
  nom: string,
  args: Args,
  sources: SourceChat[],
): Promise<unknown> {
  switch (nom) {
    case "chercher_ouvrage": {
      const trouves = await referentiel.chercherOuvrages(
        String(args.requete ?? ""),
        Math.min(Number(args.limite) || 5, 10),
      );
      const filtresLot = args.lot ? String(args.lot).toUpperCase() : null;
      const filtresUnite = args.unite ? String(args.unite) : null;
      const retenus = trouves.filter(
        (o) =>
          (!filtresLot || o.lotCode?.toUpperCase().startsWith(filtresLot)) &&
          (!filtresUnite || o.unite === filtresUnite),
      );
      const resultats = [];
      for (const o of retenus) {
        const s = await ouvrages.statsOuvrage(o.id);
        resultats.push({
          id: o.id,
          code: o.code,
          libelle_devis: o.libelleDevis,
          lot: o.lotLibelle,
          unite: o.unite,
          est_forfaitaire: o.estForfaitaire,
          n: s?.n ?? 0,
          mediane_actualisee: s ? valeurs(s, true).mediane : null,
        });
      }
      return { ouvrages: resultats };
    }

    case "stats_ouvrage": {
      const id = String(args.ouvrage_id ?? "");
      const indexe = args.indexe !== false;
      const typeTravaux: TypeTravaux =
        args.est_ts === true ? "ts" : args.est_ts === false ? "normaux" : "tous";
      const filtres: FiltresPrix = {
        typeTravaux,
        zones: args.zone ? [args.zone as CodeZone] : undefined,
        depuis: args.depuis ? String(args.depuis) : undefined,
        jusquA: args.jusqu_a ? String(args.jusqu_a) : undefined,
        indexe,
      };
      const [ouvrage, s] = await Promise.all([
        ouvrages.obtenirOuvrage(id),
        ouvrages.statsOuvrage(id, filtres),
      ]);
      if (!ouvrage) return { erreur: "Ouvrage introuvable." };
      if (!s || s.n === 0) {
        return {
          ouvrage: ouvrage.libelleDevis,
          resultat: "Aucune occurrence pour ces filtres.",
        };
      }
      sources.push({
        ouvrageId: id,
        libelle: ouvrage.libelleDevis,
        n: s.n,
        periode: periodeDe(s),
        filtres:
          [
            typeTravaux !== "tous" ? typeTravaux : null,
            args.zone ? `zone ${args.zone}` : null,
            args.depuis || args.jusqu_a
              ? `${args.depuis ?? "…"} → ${args.jusqu_a ?? "…"}`
              : null,
          ]
            .filter(Boolean)
            .join(", ") || null,
      });
      return {
        ouvrage: ouvrage.libelleDevis,
        unite: ouvrage.unite,
        type_travaux: typeTravaux,
        ...resumeStats(s, indexe),
      };
    }

    case "comparer_ouvrages": {
      const ids = (args.ouvrage_ids as string[]) ?? [];
      const dimension = String(args.dimension ?? "type");
      const lignes = [];
      for (const id of ids) {
        const ouvrage = await ouvrages.obtenirOuvrage(id);
        if (!ouvrage) continue;
        if (dimension === "zone") {
          const zones = await ouvrages.statsParZone(id);
          lignes.push({
            ouvrage: ouvrage.libelleDevis,
            unite: ouvrage.unite,
            par_zone: zones.map((z) => ({
              zone: z.zoneLibelle,
              stats: resumeStats(z.stats, true),
              ecart_global_pct: z.ecartGlobal,
              insuffisant: z.insuffisant,
            })),
          });
          const g = await ouvrages.statsOuvrage(id);
          if (g && g.n > 0) {
            sources.push({
              ouvrageId: id, libelle: ouvrage.libelleDevis,
              n: g.n, periode: periodeDe(g), filtres: "par zone",
            });
          }
        } else if (dimension === "type") {
          const [n, t] = await Promise.all([
            ouvrages.statsOuvrage(id, { typeTravaux: "normaux" }),
            ouvrages.statsOuvrage(id, { typeTravaux: "ts" }),
          ]);
          const vn = n && n.n > 0 ? valeurs(n, true).mediane : null;
          const vt = t && t.n > 0 ? valeurs(t, true).mediane : null;
          lignes.push({
            ouvrage: ouvrage.libelleDevis,
            unite: ouvrage.unite,
            normaux: resumeStats(n, true),
            ts: resumeStats(t, true),
            ecart_ts_pct:
              vn && vt ? Math.round(((vt - vn) / vn) * 1000) / 10 : null,
          });
          const s = n ?? t;
          if (s && s.n > 0) {
            sources.push({
              ouvrageId: id, libelle: ouvrage.libelleDevis,
              n: (n?.n ?? 0) + (t?.n ?? 0), periode: periodeDe(s),
              filtres: "normaux vs TS",
            });
          }
        } else {
          const annees = [];
          for (const a of ["2024", "2025", "2026"]) {
            const s = await ouvrages.statsOuvrage(id, {
              depuis: `${a}-01-01`,
              jusquA: `${a}-12-31`,
            });
            annees.push({ annee: a, stats: resumeStats(s, true) });
          }
          lignes.push({
            ouvrage: ouvrage.libelleDevis,
            unite: ouvrage.unite,
            par_annee: annees,
          });
          const g = await ouvrages.statsOuvrage(id);
          if (g && g.n > 0) {
            sources.push({
              ouvrageId: id, libelle: ouvrage.libelleDevis,
              n: g.n, periode: periodeDe(g), filtres: "par année",
            });
          }
        }
      }
      return { dimension, comparaison: lignes };
    }

    case "chercher_client": {
      const clients = await historique.chercherClient(
        String(args.requete ?? ""),
      );
      return {
        clients: clients.map((c) => ({
          id: c.id,
          nom: c.nom,
          n_documents: c.nbDocuments,
          total_cumule: c.totalCumule,
        })),
      };
    }

    case "documents_client": {
      const page = await historique.listerDocuments(
        {
          clientId: String(args.client_id ?? ""),
          depuis: args.depuis ? String(args.depuis) : undefined,
          jusquA: args.jusqu_a ? String(args.jusqu_a) : undefined,
        },
        1,
      );
      return {
        total: page.total,
        documents: page.lignes.map((d) => ({
          id: d.id,
          numero: d.numero,
          date: d.date,
          type: d.type,
          est_ts: d.estTs,
          objet: d.chantierObjet,
          commune: d.chantierCommune,
          total_ht: d.totalHt,
        })),
      };
    }

    case "lignes_document": {
      const doc = await historique.obtenirDocument(
        String(args.document_id ?? ""),
      );
      if (!doc) return { erreur: "Document introuvable." };
      return {
        numero: doc.numero,
        date: doc.date,
        client: doc.client?.nom ?? null,
        est_ts: doc.estTs,
        total_ht: doc.totalHt,
        lignes: doc.lignes.map((l) => ({
          designation: l.designationBrute,
          unite: l.unite ?? l.uniteBrute,
          quantite: l.quantite,
          pu_ht: l.pu,
          total_ht: l.total,
          exclu_des_agregats: l.excluAgregats,
        })),
      };
    }

    case "cooccurrences": {
      const id = String(args.ouvrage_id ?? "");
      const liste = await ouvrages.cooccurrences(
        id,
        Math.min(Number(args.limite) || 5, 10),
      );
      return {
        cooccurrences: liste.map((c) => ({
          ouvrage_id: c.ouvrage.id,
          ouvrage: c.ouvrage.libelleDevis,
          taux: c.taux,
          ratio_quantite: c.ratioQuantite,
          n_documents_communs: c.nEnsemble,
        })),
      };
    }

    default:
      return { erreur: `Outil inconnu : ${nom}` };
  }
}
