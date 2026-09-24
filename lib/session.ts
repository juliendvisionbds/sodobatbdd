// =====================================================================
// Sessions — jeton HMAC (jose) dans un cookie httpOnly.
// Pas de comptes : un code d'accès par personne (table acces).
// Vérifiable dans le middleware (edge) comme côté Node.
// =====================================================================

import { SignJWT, jwtVerify } from "jose";

const DUREE_JOURS = 30;
export const COOKIE_SESSION = "sodobat_session";

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET manquante.");
  return new TextEncoder().encode(s);
}

export interface Session {
  accesId: string;
  libelle: string;
  estAdmin: boolean;
}

export async function creerJeton(session: Session): Promise<string> {
  return new SignJWT({
    lib: session.libelle,
    adm: session.estAdmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.accesId)
    .setIssuedAt()
    .setExpirationTime(`${DUREE_JOURS}d`)
    .sign(secret());
}

export async function verifierJeton(jeton: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(jeton, secret());
    if (!payload.sub) return null;
    return {
      accesId: payload.sub,
      libelle: (payload.lib as string) ?? "",
      estAdmin: Boolean(payload.adm),
    };
  } catch {
    return null;
  }
}

export const OPTIONS_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: DUREE_JOURS * 24 * 60 * 60,
};
