"use server";

// Actions sur les pièces (documents) depuis l'onglet « Documents à
// revoir » : accepter, rejeter (motif obligatoire), basculer TS.

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "../session-serveur";
import { referentiel } from "../queries";
import type { ChampsDocument, UUID } from "../types";

function revalider() {
  revalidatePath("/calage");
  revalidatePath("/");
  revalidatePath("/historique");
}

export async function accepterDocumentAction(id: UUID): Promise<void> {
  const session = await exigerAdmin();
  await referentiel.changerStatutDocument(id, "valide", { acteur: session.libelle });
  revalider();
}

export async function rejeterDocumentAction(
  id: UUID,
  motif: string,
): Promise<void> {
  const session = await exigerAdmin();
  const m = motif.trim();
  if (!m) throw new Error("Un motif est requis pour rejeter une pièce.");
  await referentiel.changerStatutDocument(id, "rejete", {
    acteur: session.libelle,
    motif: m,
  });
  revalider();
}

export async function remettreARevoirAction(id: UUID): Promise<void> {
  const session = await exigerAdmin();
  await referentiel.changerStatutDocument(id, "a_revoir", { acteur: session.libelle });
  revalider();
}

export async function basculerTsAction(id: UUID, estTs: boolean): Promise<void> {
  const session = await exigerAdmin();
  await referentiel.modifierDocument(id, { estTs }, { acteur: session.libelle });
  revalider();
}

export async function modifierDocumentAction(
  id: UUID,
  champs: ChampsDocument,
): Promise<void> {
  const session = await exigerAdmin();
  await referentiel.modifierDocument(id, champs, { acteur: session.libelle });
  revalider();
}
