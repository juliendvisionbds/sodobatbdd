// =====================================================================
// Supabase Storage — fichiers sources des devis (bucket privé
// « documents »). Utilisé côté serveur uniquement (service_role).
// =====================================================================

import { createClient } from "@supabase/supabase-js";

export const BUCKET_DOCUMENTS = "documents";

let client: ReturnType<typeof createClient> | null = null;

export function supabaseAdmin() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !cle) {
      throw new Error(
        "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes (.env.local).",
      );
    }
    client = createClient(url, cle, { auth: { persistSession: false } });
  }
  return client;
}

/** Dépose un fichier source dans le bucket et renvoie son chemin. */
export async function deposerFichier(
  chemin: string,
  contenu: Buffer | Uint8Array,
  typeMime: string,
): Promise<string> {
  const { error } = await supabaseAdmin()
    .storage.from(BUCKET_DOCUMENTS)
    .upload(chemin, contenu, { contentType: typeMime, upsert: true });
  if (error) throw new Error(`Storage : ${error.message}`);
  return chemin;
}

/** Récupère un fichier source (relance d'un import en échec). */
export async function telechargerFichier(chemin: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET_DOCUMENTS)
    .download(chemin);
  if (error || !data) {
    throw new Error(`Storage : fichier introuvable (${chemin}).`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Lien signé (1 h) vers un fichier source, pour le bouton PDF de l'UI. */
export async function lienSigne(chemin: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET_DOCUMENTS)
    .createSignedUrl(chemin, 3600);
  if (error) return null;
  return data.signedUrl;
}
