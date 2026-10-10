// =====================================================================
// Connexion Postgres — serveur uniquement.
// La clé de connexion ne sort jamais de Vercel : aucun import de ce
// module ne doit exister dans un composant client.
// =====================================================================

import postgres, { type Sql } from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sodobat_sql: ReturnType<typeof postgres> | undefined;
}

/** Le pooler Supabase en mode Session (port 5432) refuse tout client
 *  au-delà de 15 (EMAXCONNSESSION). Sur Vercel, où chaque instance garde ses
 *  connexions, il sature et les pages tombent en erreur. On passe donc
 *  toujours par le mode Transaction (port 6543, même hôte, mêmes
 *  identifiants), y compris si DATABASE_URL pointe sur le port 5432. */
export function urlPooler(url: string): string {
  try {
    const u = new URL(url);
    const session = u.port === "5432" || u.port === "";
    if (u.hostname.endsWith(".pooler.supabase.com") && session) {
      u.port = "6543";
      return u.toString();
    }
  } catch {
    // URL non standard : laissée telle quelle
  }
  return url;
}

function creer() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL manquante.");
  }
  // max_pipeline n'est pas dans les types de postgres.js mais est bien lu.
  const options: postgres.Options<Record<string, never>> & { max_pipeline: number } = {
    // prepare:false = compatible pooler Supabase en mode transaction
    prepare: false,
    // Pas de pipelining : par défaut postgres.js écrit la requête suivante
    // sur une connexion encore occupée. Le pooler en mode Transaction
    // réattribue le serveur à chaque requête et perd alors des messages :
    // page figée (chargement infini) ou résultat d'une autre requête.
    // Reproduit en local avec 3 requêtes en parallèle sur 2 connexions.
    // Contrepartie : sql.begin ne fonctionne plus (son crochet de
    // réservation n'est jamais appelé), d'où transaction() ci-dessous.
    max_pipeline: 0,
    // Sur Vercel, chaque instance a son propre pool : peu de connexions,
    // rendues dès qu'elles ne servent plus.
    max: 2,
    idle_timeout: 20, // secondes : une connexion inactive est rendue
    max_lifetime: 60 * 5,
    onnotice: () => {},
  };
  return postgres(urlPooler(url), options);
}

// Réutilisation entre rechargements HMR en dev
export const sql = globalThis.__sodobat_sql ?? creer();
if (process.env.NODE_ENV !== "production") {
  globalThis.__sodobat_sql = sql;
}

/** Connexion réservée le temps d'une transaction. */
export type Tx = Sql<Record<string, never>>;

/** Exécute fn dans une transaction sur une connexion réservée : commit si
 *  fn aboutit, rollback sinon. Remplace sql.begin, incompatible avec
 *  max_pipeline: 0. Les requêtes faites sur tx s'exécutent l'une après
 *  l'autre, même lancées en parallèle. */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const r = await sql.reserve();
  try {
    await r`begin`;
    const v = await fn(r as unknown as Tx);
    await r`commit`;
    return v;
  } catch (e) {
    try {
      await r`rollback`;
    } catch {
      // connexion déjà perdue : rien à annuler
    }
    throw e;
  } finally {
    r.release();
  }
}
