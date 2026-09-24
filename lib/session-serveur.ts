// =====================================================================
// Lecture de la session côté serveur (Server Components et Server
// Actions). Le middleware protège les routes ; les actions revérifient
// ici, parce qu'une action serveur reste appelable directement.
// =====================================================================

import { cookies } from "next/headers";
import { COOKIE_SESSION, verifierJeton, type Session } from "./session";

export async function lireSession(): Promise<Session | null> {
  const jeton = (await cookies()).get(COOKIE_SESSION)?.value;
  return jeton ? verifierJeton(jeton) : null;
}

/** Lève si la session n'est pas administrateur. Renvoie la session sinon. */
export async function exigerAdmin(): Promise<Session> {
  const session = await lireSession();
  if (!session?.estAdmin) throw new Error("Réservé aux administrateurs.");
  return session;
}
