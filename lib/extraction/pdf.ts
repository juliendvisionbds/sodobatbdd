// =====================================================================
// Extraction PDF : le fichier natif part au modèle (entrée fichier),
// qui voit à la fois le rendu visuel et la couche texte. Couvre les PDF
// texte ET les scans, sans parser positionnel.
// =====================================================================

import { appelerExtraction, type ContenuExtraction } from "./appel-modele";
import type { DocumentExtrait } from "./schema";

/** Estimation du nombre de pages (comptage des objets /Type /Page). */
export function compterPages(fichier: Buffer): number | null {
  const texte = fichier.toString("latin1");
  const n = texte.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
  return n > 0 ? n : null;
}

export function contenuPdf(fichier: Buffer, nomFichier: string): ContenuExtraction {
  return { type: "pdf", nomFichier, base64: fichier.toString("base64") };
}

export async function extrairePdf(
  fichier: Buffer,
  nomFichier: string,
): Promise<{ extrait: DocumentExtrait; brut: unknown; nbPages: number | null }> {
  const { extrait, brut } = await appelerExtraction(contenuPdf(fichier, nomFichier));
  return { extrait, brut, nbPages: compterPages(fichier) };
}
