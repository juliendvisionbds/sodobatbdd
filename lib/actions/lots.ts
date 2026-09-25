"use server";

// Actions de l'onglet Lots : gestion de l'arborescence et validation des
// propositions de l'IA. Réservées aux administrateurs.

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "../session-serveur";
import { referentiel } from "../queries";
import type { Lot, UUID } from "../types";

function revalider() {
  revalidatePath("/calage");
  revalidatePath("/");
}

export async function creerLotAction(champs: {
  code: string;
  libelle: string;
  parentId?: UUID | null;
}): Promise<Lot> {
  await exigerAdmin();
  const lot = await referentiel.creerLot(champs);
  revalider();
  return lot;
}

export async function renommerLotAction(
  id: UUID,
  champs: { code?: string; libelle?: string },
): Promise<Lot> {
  await exigerAdmin();
  const lot = await referentiel.renommerLot(id, champs);
  revalider();
  return lot;
}

export async function deplacerLotAction(id: UUID, parentId: UUID | null): Promise<void> {
  await exigerAdmin();
  await referentiel.deplacerLot(id, parentId);
  revalider();
}

export async function supprimerLotAction(id: UUID): Promise<void> {
  await exigerAdmin();
  await referentiel.supprimerLot(id);
  revalider();
}

export async function affecterOuvragesAuLotAction(
  ouvrageIds: UUID[],
  lotId: UUID | null,
): Promise<number> {
  await exigerAdmin();
  const n = await referentiel.affecterOuvragesAuLot(ouvrageIds, lotId);
  revalider();
  return n;
}

export async function ouvragesDuLotAction(lotId: UUID | null, recherche?: string) {
  await exigerAdmin();
  return referentiel.ouvragesDuLot(lotId, recherche);
}

export async function accepterLotProposeAction(code: string): Promise<void> {
  await exigerAdmin();
  await referentiel.accepterLotPropose(code);
  revalider();
}

export async function refuserLotProposeAction(code: string): Promise<void> {
  await exigerAdmin();
  await referentiel.refuserLotPropose(code);
  revalider();
}

export async function appliquerAffectationsProposeesAction(lotCode: string): Promise<number> {
  await exigerAdmin();
  const n = await referentiel.appliquerAffectationsProposees(lotCode);
  revalider();
  return n;
}
