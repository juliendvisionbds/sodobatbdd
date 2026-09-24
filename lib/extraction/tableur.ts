// =====================================================================
// Extraction tableurs (.xls, .xlsx, .ods) : SheetJS convertit chaque
// feuille en CSV, le modèle structure le tout selon le même schéma que
// les PDF. Les DPGF Excel ont des mises en page très variables (colonnes
// fusionnées, sous-totaux, feuilles multiples) : on ne parse pas les
// colonnes nous-mêmes.
//
// Les gros DPGF (centaines de lignes) sont découpés en segments traités
// séparément puis fusionnés : sur un tableau trop long, un modèle finit
// par sauter des lignes — constaté au calibrage, détecté par l'écart
// somme(lignes) vs total imprimé.
// =====================================================================

import * as XLSX from "xlsx";
import { appelerExtraction, type ContenuExtraction } from "./appel-modele";
import type { DocumentExtrait } from "./schema";

// ~120 lignes de données par appel : assez petit pour qu'aucune ligne ne
// soit sautée, assez grand pour limiter le nombre d'appels.
const LIGNES_PAR_SEGMENT = 120;

type Segment = { texte: string; premier: boolean };

/** Convertit le classeur en segments de texte CSV prêts pour le modèle. */
export function segmenterTableur(fichier: Buffer): Segment[] {
  const classeur = XLSX.read(fichier, { type: "buffer" });
  const feuilles: Array<{ entete: string; lignes: string[] }> = [];
  classeur.SheetNames.forEach((nom, i) => {
    const csv = XLSX.utils.sheet_to_csv(classeur.Sheets[nom], {
      blankrows: false,
    });
    if (!csv.trim()) return;
    feuilles.push({
      entete: `=== Feuille ${i + 1} : ${nom} ===`,
      lignes: csv.split("\n"),
    });
  });
  if (feuilles.length === 0) throw new Error("Tableur vide ou illisible.");

  const total = feuilles.reduce((s, f) => s + f.lignes.length, 0);
  if (total <= LIGNES_PAR_SEGMENT * 1.5) {
    return [
      {
        premier: true,
        texte: feuilles.map((f) => `${f.entete}\n${f.lignes.join("\n")}`).join("\n\n"),
      },
    ];
  }

  // Découpage par blocs, sans couper une feuille au milieu d'un bloc si
  // possible : chaque segment garde l'en-tête de sa feuille d'origine.
  const segments: Segment[] = [];
  for (const feuille of feuilles) {
    for (let debut = 0; debut < feuille.lignes.length; debut += LIGNES_PAR_SEGMENT) {
      const bloc = feuille.lignes.slice(debut, debut + LIGNES_PAR_SEGMENT);
      const suite = debut > 0 ? ` (suite, lignes ${debut + 1}+)` : "";
      segments.push({
        premier: segments.length === 0,
        texte: `${feuille.entete}${suite}\n${bloc.join("\n")}`,
      });
    }
  }
  return segments;
}

export function contenuTableur(fichier: Buffer): ContenuExtraction {
  // Utilisé par le mode batch : uniquement les tableurs qui tiennent en
  // un segment. Les gros passent par extraireTableur (multi-appels).
  const segments = segmenterTableur(fichier);
  if (segments.length > 1) {
    throw new Error("TABLEUR_SEGMENTE");
  }
  return { type: "texte", texte: segments[0].texte };
}

function fusionner(extraits: DocumentExtrait[]): DocumentExtrait {
  const premier = extraits[0];
  const lignes = extraits
    .flatMap((e) => e.lignes)
    .map((l, i) => ({ ...l, ordre: i + 1 }));

  // Totaux : les sous-parties portent des sous-totaux, le récapitulatif
  // porte le total du marché — on garde le plus grand montant rencontré.
  let totalHt: number | null = null;
  let totalTtc: number | null = null;
  for (const e of extraits) {
    if (e.total_ht != null && (totalHt == null || e.total_ht > totalHt)) {
      totalHt = e.total_ht;
    }
    if (e.total_ttc != null && (totalTtc == null || e.total_ttc > totalTtc)) {
      totalTtc = e.total_ttc;
    }
  }

  const premierNonNul = <T>(sel: (e: DocumentExtrait) => T | null): T | null => {
    for (const e of extraits) {
      const v = sel(e);
      if (v != null) return v;
    }
    return null;
  };

  return {
    ...premier,
    type_document:
      premier.type_document !== "indetermine"
        ? premier.type_document
        : (extraits.find((e) => e.type_document !== "indetermine")?.type_document ??
          "indetermine"),
    numero_document: premierNonNul((e) => e.numero_document),
    date_document: premierNonNul((e) => e.date_document),
    client_nom: premierNonNul((e) => e.client_nom),
    client_code_postal: premierNonNul((e) => e.client_code_postal),
    client_commune: premierNonNul((e) => e.client_commune),
    chantier_objet: premierNonNul((e) => e.chantier_objet),
    chantier_code_postal: premierNonNul((e) => e.chantier_code_postal),
    chantier_commune: premierNonNul((e) => e.chantier_commune),
    total_ht: totalHt,
    tva_taux: premierNonNul((e) => e.tva_taux),
    total_ttc: totalTtc,
    lignes,
    remarques:
      extraits
        .map((e) => e.remarques)
        .filter(Boolean)
        .join(" | ") || null,
  };
}

export async function extraireTableur(
  fichier: Buffer,
): Promise<{ extrait: DocumentExtrait; brut: unknown; nbPages: number | null }> {
  const segments = segmenterTableur(fichier);

  if (segments.length === 1) {
    const { extrait, brut } = await appelerExtraction({
      type: "texte",
      texte: segments[0].texte,
    });
    return { extrait, brut, nbPages: null };
  }

  // Segments indépendants : traités 4 de front, fusion dans l'ordre.
  const PARALLELE = 4;
  const extraits: DocumentExtrait[] = new Array(segments.length);
  let curseur = 0;
  async function travailleur() {
    while (curseur < segments.length) {
      const i = curseur++;
      const segment = segments[i];
      const contexte = segment.premier
        ? ""
        : `\n\nATTENTION : ceci est le segment ${i + 1}/${segments.length} du MÊME document (les autres segments sont extraits séparément). Extrais uniquement les lignes de CE segment. Pour les champs d'en-tête (client, numéro, dates) : null si absents de ce segment. Si ce segment contient un récapitulatif avec le total général du document, renseigne total_ht/total_ttc.`;
      const { extrait } = await appelerExtraction({
        type: "texte",
        texte: segment.texte + contexte,
      });
      extraits[i] = extrait;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PARALLELE, segments.length) }, travailleur),
  );

  const fusionne = fusionner(extraits);
  return { extrait: fusionne, brut: fusionne, nbPages: null };
}
