"use server";

// Actions serveur de l'écran /import. Réservées aux administrateurs
// (le middleware bloque déjà /import ; les actions revérifient).

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/session-serveur";
import {
  formatAccepte,
  rafraichirAgregats,
  relancerImport,
  traiterFichier,
  type BilanFichier,
} from "@/lib/extraction/pipeline";

function revalider() {
  revalidatePath("/import");
  revalidatePath("/");
  revalidatePath("/historique");
  revalidatePath("/calage");
}

/**
 * Traite UN fichier déposé. L'écran appelle cette action fichier par
 * fichier, séquentiellement : la file de statuts avance au fur et à
 * mesure et un échec n'interrompt pas les suivants.
 */
export async function importerFichierAction(
  formData: FormData,
): Promise<BilanFichier> {
  await exigerAdmin();
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File)) throw new Error("Aucun fichier reçu.");
  if (!formatAccepte(fichier.name)) {
    throw new Error("Format non pris en charge (pdf, xls, xlsx, ods).");
  }
  const contenu = Buffer.from(await fichier.arrayBuffer());
  const bilan = await traiterFichier(fichier.name, contenu);
  revalider();
  return bilan;
}

export async function relancerImportAction(
  importId: string,
): Promise<BilanFichier> {
  await exigerAdmin();
  const bilan = await relancerImport(importId);
  await rafraichirAgregats();
  revalider();
  return bilan;
}

/** Recalcule les agrégats après un lot (appelé une fois en fin de dépôt). */
export async function rafraichirAgregatsAction(): Promise<void> {
  await exigerAdmin();
  await rafraichirAgregats();
  revalider();
}
