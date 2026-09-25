// =====================================================================
// Vérification locale : parcourt toutes les pages protégées avec une
// session générée en mémoire (jamais affichée) et vérifie le contenu.
// Usage : npx tsx scripts/verif-pages.ts [port]
// =====================================================================

import { config } from "dotenv";
config({ path: ".env.local" });

const PORT = process.argv[2] ?? "3060";
const BASE = `http://localhost:${PORT}`;

async function principal() {
  // imports dynamiques : après le chargement de .env.local
  const { sql } = await import("../lib/db");
  const { creerJeton, COOKIE_SESSION } = await import("../lib/session");
  const [acces] = await sql`
    select id, libelle, est_admin from acces
    where actif = true and est_admin = true limit 1`;
  if (!acces) throw new Error("Aucun accès admin actif en base.");

  const jeton = await creerJeton({
    accesId: acces.id as string,
    libelle: acces.libelle as string,
    estAdmin: true,
  });
  const entetes = { Cookie: `${COOKIE_SESSION}=${jeton}` };

  const [premierOuvrage] = await sql`
    select o.id from ouvrages o
    join rattachements r on r.ouvrage_id = o.id
    where o.actif = true and o.est_forfaitaire = false
    group by o.id order by count(*) desc limit 1`;

  const [premierDocument] = await sql`
    select id from documents where storage_path is not null limit 1`;

  const cas: Array<{ chemin: string; attendu: string[]; statut?: number }> = [
    { chemin: "/", attendu: ["ouvrage", "Sodobat"] },
    { chemin: "/?sansprix=1", attendu: ["Affichage"] },
    {
      chemin: `/?ouvrage=${premierOuvrage.id}`,
      attendu: ["Par zone", "source"],
    },
    { chemin: "/historique", attendu: ["document"] },
    { chemin: "/historique?mode=lignes", attendu: ["ligne"] },
    { chemin: "/calage", attendu: ["Par ouvrage", "Ligne à ligne"] },
    { chemin: "/calage?onglet=file", attendu: ["Valider"] },
    { chemin: "/calage?onglet=documents", attendu: ["revoir"] },
    { chemin: "/calage?onglet=doublons", attendu: ["oublon"] },
    { chemin: "/calage?onglet=sans-ouvrage", attendu: ["ouvrage"] },
    { chemin: "/calage?onglet=hors-perimetre", attendu: ["carté"] },
    { chemin: "/calage?onglet=lots", attendu: ["Arborescence"] },
    { chemin: "/calage?onglet=documents&incomplets=1", attendu: ["incompl"] },
    { chemin: "/calage?onglet=referentiel", attendu: ["Fusionner"] },
    { chemin: "/frais", attendu: ["Frais de chantier"] },
    { chemin: "/chat", attendu: ["Assistant"] },
    { chemin: "/api/export?q=beton", attendu: ["Lot"] },
    ...(premierDocument
      ? [{ chemin: `/api/documents/${premierDocument.id}/fichier`, attendu: [], statut: 302 }]
      : []),
  ];

  let echecs = 0;
  for (const { chemin, attendu, statut = 200 } of cas) {
    const debut = Date.now();
    const reponse = await fetch(BASE + chemin, {
      headers: entetes,
      redirect: "manual",
    });
    const texte = await reponse.text();
    const ms = Date.now() - debut;
    const manquants = attendu.filter((a) => !texte.includes(a));
    const ok = reponse.status === statut && manquants.length === 0;
    if (!ok) echecs++;
    console.log(
      `${ok ? "OK " : "ÉCHEC"}  ${String(reponse.status)}  ${String(ms).padStart(5)} ms  ${chemin}` +
        (manquants.length > 0 ? `  — introuvable : ${manquants.join(", ")}` : ""),
    );
  }

  // sans cookie : redirection vers /connexion attendue
  const sans = await fetch(BASE + "/", { redirect: "manual" });
  const okAuth = sans.status === 307 || sans.status === 302;
  if (!okAuth) echecs++;
  console.log(
    `${okAuth ? "OK " : "ÉCHEC"}  ${sans.status}         /  (sans session → redirection)`,
  );

  await sql.end();
  if (echecs > 0) {
    console.error(`\n${echecs} vérification(s) en échec.`);
    process.exit(1);
  }
  console.log("\nToutes les pages répondent correctement.");
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
