"use server";

// =====================================================================
// Connexion par code d'accès. Comparaison bcrypt côté serveur,
// journalisation, limitation à 10 tentatives par IP et par heure.
// =====================================================================

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { sql } from "../db";
import { COOKIE_SESSION, OPTIONS_COOKIE, creerJeton } from "../session";

const FENETRE_MS = 60 * 60 * 1000;
const MAX_TENTATIVES = 10;
const tentativesParIp = new Map<string, number[]>();

function tropDeTentatives(ip: string): boolean {
  const maintenant = Date.now();
  const liste = (tentativesParIp.get(ip) ?? []).filter(
    (t) => maintenant - t < FENETRE_MS,
  );
  tentativesParIp.set(ip, liste);
  return liste.length >= MAX_TENTATIVES;
}

function enregistrerTentative(ip: string) {
  const liste = tentativesParIp.get(ip) ?? [];
  liste.push(Date.now());
  tentativesParIp.set(ip, liste);
}

export interface EtatConnexion {
  erreur: string | null;
}

export async function connecter(
  _etat: EtatConnexion,
  formData: FormData,
): Promise<EtatConnexion> {
  const code = String(formData.get("code") ?? "").trim();
  const suite = String(formData.get("suite") ?? "") || "/";

  if (!code) return { erreur: "Saisir un code d'accès." };

  const entetes = await headers();
  const ip =
    entetes.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  if (tropDeTentatives(ip)) {
    return {
      erreur: "Trop de tentatives. Réessayer dans une heure.",
    };
  }
  enregistrerTentative(ip);

  const acces = await sql`
    select id, libelle, code_hash, est_admin from acces where actif = true`;
  const trouve = acces.find((a) =>
    bcrypt.compareSync(code, a.code_hash as string),
  );

  if (!trouve) {
    return { erreur: "Code d'accès inconnu ou révoqué." };
  }

  await sql`update acces set dernier_acces = now() where id = ${trouve.id}`;
  await sql`insert into journal_acces (acces_id, action, detail)
    values (${trouve.id}, 'connexion', ${sql.json({ ip })})`;

  const jeton = await creerJeton({
    accesId: trouve.id as string,
    libelle: trouve.libelle as string,
    estAdmin: Boolean(trouve.est_admin),
  });
  const magasin = await cookies();
  magasin.set(COOKIE_SESSION, jeton, OPTIONS_COOKIE);

  // ne rediriger que vers des écrans existants (évite un 404 si l'URL
  // d'origine était erronée)
  const ROUTES_CONNUES = ["/frais", "/historique", "/chat", "/calage", "/import"];
  const suiteValide =
    suite === "/" || ROUTES_CONNUES.some((r) => suite.startsWith(r));
  redirect(suiteValide ? suite : "/");
}

export async function deconnecter(): Promise<void> {
  const magasin = await cookies();
  magasin.delete(COOKIE_SESSION);
  redirect("/connexion");
}
