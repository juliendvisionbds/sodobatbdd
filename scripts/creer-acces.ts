// =====================================================================
// Création d'un code d'accès :
//   npm run db:acces -- "Métreur 2" "le-code-secret" [--admin]
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";
import bcrypt from "bcryptjs";

const [libelle, code] = process.argv.slice(2).filter((a) => a !== "--admin");
const estAdmin = process.argv.includes("--admin");

if (!libelle || !code) {
  console.error('Usage : npm run db:acces -- "Libellé" "code" [--admin]');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

sql`insert into acces (libelle, code_hash, est_admin)
    values (${libelle}, ${bcrypt.hashSync(code, 10)}, ${estAdmin})`
  .then(() => {
    console.log(`Accès « ${libelle} » créé${estAdmin ? " (administrateur)" : ""}.`);
    return sql.end();
  })
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
