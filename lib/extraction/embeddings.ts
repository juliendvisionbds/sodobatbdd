// =====================================================================
// Embeddings des ouvrages (OpenAI text-embedding-3-small, 1 536 dims) :
// servent au rapprochement « par sens » des quasi-doublons du
// référentiel. Le texte embarque l'unité et le lot pour que deux
// prestations de même nom mais d'unité différente restent distinctes.
// =====================================================================

import { openai } from "./appel-modele";

export const MODELE_EMBEDDING =
  process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
export const DIMENSIONS_EMBEDDING = 1536;

export function texteEmbeddingOuvrage(o: {
  libelleNormalise: string;
  unite: string | null;
  lot: string | null;
}): string {
  return `${o.libelleNormalise} | ${o.unite ?? "?"} | ${o.lot ?? "?"}`;
}

/** Jusqu'à 100 textes par appel. */
export async function calculerEmbeddings(textes: string[]): Promise<number[][]> {
  if (textes.length === 0) return [];
  const reponse = await openai().embeddings.create({
    model: MODELE_EMBEDDING,
    input: textes,
    dimensions: DIMENSIONS_EMBEDDING,
  });
  return reponse.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
