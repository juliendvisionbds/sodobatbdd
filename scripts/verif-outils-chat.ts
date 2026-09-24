// Vérification manuelle des outils du chat contre la base locale.
// Usage : npx tsx scripts/verif-outils-chat.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function principal() {
  const { executerOutil } = await import("../lib/chat/outils");
  const { sql } = await import("../lib/db");
  const sources: import("../lib/chat/outils").SourceChat[] = [];

  const r1 = (await executerOutil(
    "chercher_ouvrage",
    { requete: "ipn 160" },
    sources,
  )) as { ouvrages: Array<{ id: string; libelle_devis: string; n: number; mediane_actualisee: number | null }> };
  console.log("chercher_ouvrage :", r1.ouvrages.slice(0, 2));

  const id = r1.ouvrages[0]?.id;
  console.log(
    "stats_ouvrage :",
    await executerOutil("stats_ouvrage", { ouvrage_id: id }, sources),
  );
  const r3 = (await executerOutil(
    "chercher_client",
    { requete: "croi du sud" },
    sources,
  )) as { clients: unknown[] };
  console.log("chercher_client (faute volontaire) :", r3.clients.slice(0, 1));
  const r4 = (await executerOutil(
    "cooccurrences",
    { ouvrage_id: id },
    sources,
  )) as { cooccurrences: unknown[] };
  console.log("cooccurrences :", r4.cooccurrences.slice(0, 2));
  const r5 = (await executerOutil(
    "comparer_ouvrages",
    { ouvrage_ids: [id], dimension: "type" },
    sources,
  )) as { comparaison: Array<{ ecart_ts_pct: number | null }> };
  console.log("comparer (écart TS %) :", r5.comparaison[0]?.ecart_ts_pct);
  console.log("sources accumulées :", sources);

  await sql.end();
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
