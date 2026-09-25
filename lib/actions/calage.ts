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
  const session = await exigerAdmin();
  await referentiel.validerRattachement(id, ouvrageId, { acteur: session.libelle });
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
  const session = await exigerAdmin();
  const supplementaires = o.aussiIdentiques
    ? (await referentiel.lignesIdentiquesSansOuvrage(ligneId)).filter((id) => id !== ligneId)
    : [];
  const r = await referentiel.creerOuvrageDepuisLigne(ligneId, champs, {
    lignesSupplementaires: supplementaires,
    acteur: session.libelle,
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
  const session = await exigerAdmin();
  await referentiel.modifierOuvrage(id, champs, { acteur: session.libelle });
  revalider();
}

export async function fusionnerOuvragesAction(
  sourceId: UUID,
  cibleId: UUID,
): Promise<void> {
  const session = await exigerAdmin();
  if (sourceId === cibleId) {
    throw new Error("Impossible de fusionner un ouvrage avec lui-même.");
  }
  await referentiel.fusionnerOuvrages(sourceId, cibleId, { acteur: session.libelle });
  revalider();
}

// ---------------------------------------------------------------------
// Validation en masse et annulation
// ---------------------------------------------------------------------

export async function validerRattachementsAction(ids: UUID[]): Promise<UUID[]> {
  const session = await exigerAdmin();
  const valides = await referentiel.validerRattachements(ids, { acteur: session.libelle });
  revalider();
  return valides;
}

export async function validerOuvrageAction(
  ouvrageId: UUID,
  filtres?: FiltresCalage,
): Promise<{ ids: UUID[]; ignoresUnite: number }> {
  const session = await exigerAdmin();
  const r = await referentiel.validerParOuvrage(ouvrageId, { filtres, acteur: session.libelle });
  revalider();
  return { ids: r.ids, ignoresUnite: r.ignoresUnite };
}

export async function devaliderRattachementsAction(ids: UUID[]): Promise<number> {
  const session = await exigerAdmin();
  const n = await referentiel.devaliderRattachements(ids, { acteur: session.libelle });
  revalider();
  return n;
}

export async function annulerDerniereActionAction(): Promise<{
  action: string;
  n: number;
} | null> {
  const session = await exigerAdmin();
  const r = await referentiel.annulerDerniereAction({ acteur: session.libelle });
  revalider();
  return r;
}

/** Rattache des lignes sans ouvrage (ou en change) et valide. */
export async function rattacherLignesAction(
  ligneIds: UUID[],
  ouvrageId: UUID,
  o: { aussiIdentiques?: boolean } = {},
): Promise<UUID[]> {
  const session = await exigerAdmin();
  let ids = ligneIds;
  if (o.aussiIdentiques && ligneIds.length === 1) {
    const identiques = await referentiel.lignesIdentiquesSansOuvrage(ligneIds[0]);
    ids = [...new Set([...ligneIds, ...identiques])];
  }
  const r = await referentiel.rattacherLignes(ids, ouvrageId, { acteur: session.libelle });
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
  const session = await exigerAdmin();
  await referentiel.accepterFusion(id, { inverser, acteur: session.libelle });
  revalider();
}

export async function ignorerFusionAction(id: UUID): Promise<void> {
  const session = await exigerAdmin();
  await referentiel.refuserFusion(id, { acteur: session.libelle });
  revalider();
}

// ---------------------------------------------------------------------
// Hors périmètre
// ---------------------------------------------------------------------

export async function reintegrerHorsPerimetreAction(ligneIds: UUID[]): Promise<number> {
  const session = await exigerAdmin();
  const n = await referentiel.reintegrerHorsPerimetre(ligneIds, { acteur: session.libelle });
  revalider();
  return n;
}

export async function confirmerHorsPerimetreAction(ligneIds: UUID[]): Promise<number> {
  const session = await exigerAdmin();
  const n = await referentiel.confirmerHorsPerimetre(ligneIds, { acteur: session.libelle });
  revalider();
  return n;
}
