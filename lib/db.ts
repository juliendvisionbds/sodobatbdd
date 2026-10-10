// =====================================================================
// Connexion Postgres — serveur uniquement.
// La clé de connexion ne sort jamais de Vercel : aucun import de ce
// module ne doit exister dans un composant client.
// =====================================================================

import postgres from "postgres";

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
  return postgres(urlPooler(url), {
    // prepare:false = compatible pooler Supabase en mode transaction
    prepare: false,
    // Sur Vercel, chaque instance a son propre pool : peu de connexions,
    // rendues dès qu'elles ne servent plus.
    max: 2,
    idle_timeout: 20, // secondes : une connexion inactive est rendue
    max_lifetime: 60 * 5,
    onnotice: () => {},
  });
}

// Réutilisation entre rechargements HMR en dev
export const sql = globalThis.__sodobat_sql ?? creer();
if (process.env.NODE_ENV !== "production") {
  globalThis.__sodobat_sql = sql;
}
