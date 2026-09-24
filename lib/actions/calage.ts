"use server";

// Actions serveur du calage. Chaque écriture passe par lib/queries
// (qui rafraîchit les agrégats) puis revalide les écrans concernés.

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "../session-serveur";
import { referentiel } from "../queries";
import type { CodeUnite, FiltresCalage, Ouvrage, UUID } from "../types";

function revalider() {
  revalidatePath("/calage");
  revalidatePath("/");
  revalidatePath("/historique");
}

export async function validerRattachementAction(
  id: UUID,
  ouvrageId?: UUID,
): Promise<void> {
  await exigerAdmin();
  await referentiel.validerRattachement(id, ouvrageId);
  revalider();
}

export async function creerOuvrageDepuisLigneAction(
  ligneId: UUID,
  champs: {
    libelleDevis: string;
    libelleNormalise?: string;
    lotId?: UUID;
    code?: string;
    unite?: CodeUnite;
    estForfaitaire?: boolean;
  },
  o: { aussiIdentiques?: boolean } = {},
): Promise<UUID[]> {
  await exigerAdmin();
  const supplementaires = o.aussiIdentiques
    ? (await referentiel.lignesIdentiquesSansOuvrage(ligneId)).filter((id) => id !== ligneId)
    : [];
  const r = await referentiel.creerOuvrageDepuisLigne(ligneId, champs, {
    lignesSupplementaires: supplementaires,
  });
  revalider();
  return r.rattachementIds;
}

export async function rechercherOuvragesAction(
  requete: string,
): Promise<Ouvrage[]> {
  await exigerAdmin();
  if (!requete.trim()) return [];
  return referentiel.chercherOuvrages(requete, 8);
}

export async function modifierOuvrageAction(
  id: UUID,
  champs: Partial<Ouvrage>,
): Promise<void> {
  await exigerAdmin();
  await referentiel.modifierOuvrage(id, champs);
  revalider();
}

export async function fusionnerOuvragesAction(
  sourceId: UUID,
  cibleId: UUID,
): Promise<void> {
  await exigerAdmin();
  if (sourceId === cibleId) {
    throw new Error("Impossible de fusionner un ouvrage avec lui-même.");
  }
  await referentiel.fusionnerOuvrages(sourceId, cibleId);
  revalider();
}

// ---------------------------------------------------------------------
// Validation en masse et annulation
// ---------------------------------------------------------------------

export async function validerRattachementsAction(ids: UUID[]): Promise<UUID[]> {
  await exigerAdmin();
  const valides = await referentiel.validerRattachements(ids);
  revalider();
  return valides;
}

export async function validerOuvrageAction(
  ouvrageId: UUID,
  filtres?: FiltresCalage,
): Promise<UUID[]> {
  await exigerAdmin();
  const r = await referentiel.validerParOuvrage(ouvrageId, { filtres });
  revalider();
  return r.ids;
}

export async function devaliderRattachementsAction(ids: UUID[]): Promise<number> {
  await exigerAdmin();
  const n = await referentiel.devaliderRattachements(ids);
  revalider();
  return n;
}

export async function annulerDerniereActionAction(): Promise<{
  action: string;
  n: number;
} | null> {
  await exigerAdmin();
  const r = await referentiel.annulerDerniereAction();
  revalider();
  return r;
}

/** Rattache des lignes sans ouvrage (ou en change) et valide. */
export async function rattacherLignesAction(
  ligneIds: UUID[],
  ouvrageId: UUID,
  o: { aussiIdentiques?: boolean } = {},
): Promise<UUID[]> {
  await exigerAdmin();
  let ids = ligneIds;
  if (o.aussiIdentiques && ligneIds.length === 1) {
    const identiques = await referentiel.lignesIdentiquesSansOuvrage(ligneIds[0]);
    ids = [...new Set([...ligneIds, ...identiques])];
  }
  const r = await referentiel.rattacherLignes(ids, ouvrageId);
  revalider();
  return r;
}

// ---------------------------------------------------------------------
// Propositions de fusion
// ---------------------------------------------------------------------

export async function fusionnerProposeeAction(
  id: UUID,
  inverser = false,
): Promise<void> {
  await exigerAdmin();
  await referentiel.accepterFusion(id, { inverser });
  revalider();
}

export async function ignorerFusionAction(id: UUID): Promise<void> {
  await exigerAdmin();
  await referentiel.refuserFusion(id);
  revalider();
}
