"use server";

// Actions de la fiche ouvrage : écarter une ligne aberrante des
// statistiques (sans la supprimer), ou la réintégrer. Chaque action
// relance rafraichir_agregats() puis recharge l'écran : la médiane
// affichée doit visiblement bouger.

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "../session-serveur";
import { exclureLigne, reintegrerLigne } from "../queries/ouvrages";

export async function exclureLigneAction(
  ligneId: string,
  motif: string,
): Promise<void> {
  await exigerAdmin();
  await exclureLigne(ligneId, motif.trim() || "Écartée depuis la fiche");
  revalidatePath("/");
}

export async function reintegrerLigneAction(ligneId: string): Promise<void> {
  await exigerAdmin();
  await reintegrerLigne(ligneId);
  revalidatePath("/");
}
