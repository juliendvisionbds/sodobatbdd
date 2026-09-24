// =====================================================================
// Base Postgres locale (développement uniquement).
// Utilise embedded-postgres : de vrais binaires PostgreSQL 17, sans
// Docker ni installation système. Les données vivent dans .pgdata/.
//
//   npm run db:local     — démarre la base (laisser tourner)
//
// En production, l'application se connecte à Supabase via DATABASE_URL :
// ce script ne sert jamais en prod.
// =====================================================================

import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".pgdata");
const PORT = 5502;

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });

  const dejaInitialisee = existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (!dejaInitialisee) {
    console.log("Initialisation du cluster Postgres local…");
    await pg.initialise();
  }

  await pg.start();

  try {
    await pg.createDatabase("sodobat");
    console.log("Base 'sodobat' créée.");
  } catch {
    // déjà créée
  }

  console.log(
    `Postgres local prêt : postgres://postgres:postgres@127.0.0.1:${PORT}/sodobat`,
  );
  console.log("Laisser ce processus tourner. Ctrl+C pour arrêter.");

  const stop = async () => {
    console.log("\nArrêt de Postgres…");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // reste vivant
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
