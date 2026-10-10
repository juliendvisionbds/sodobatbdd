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

function creer() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL manquante.");
  }
  return postgres(url, {
    // prepare:false = compatible pooler Supabase en mode transaction
    prepare: false,
    // Sur Vercel, chaque route est une instance avec son propre pool. À 5
    // connexions jamais rendues, quelques pages suffisaient à atteindre la
    // limite du pooler Supabase (15) : pages en erreur par intermittence.
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
