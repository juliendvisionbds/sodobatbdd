// =====================================================================
// Export CSV du tableau filtré. Format français : séparateur « ; »,
// virgule décimale, BOM UTF-8 pour Excel.
// =====================================================================

import { NextRequest } from "next/server";
import { ouvrages } from "@/lib/queries";
import { lireFiltres, lireTri } from "@/lib/filtres-url";
import { valeurs, LIBELLES_UNITES } from "@/lib/types";

export const dynamic = "force-dynamic";

const champ = (v: string | number | null | undefined): string =>
  `"${String(v ?? "").replace(/"/g, '""')}"`;

const nombreFr = (v: number | null | undefined): string =>
  v == null ? "" : String(v).replace(".", ",");

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filtres = lireFiltres(params);
  const tri = lireTri(params);
  const indexe = filtres.indexe !== false;

  const page = await ouvrages.listerOuvrages(filtres, tri, 1, 10000);

  const lignes: string[] = [
    [
      "Lot", "Code", "Ouvrage", "Unité",
      indexe ? "Médiane normaux (actualisée)" : "Médiane normaux (brute)",
      "n normaux", "Min normaux", "Max normaux",
      indexe ? "Médiane TS (actualisée)" : "Médiane TS (brute)",
      "n TS", "Écart TS (%)", "Fiabilité", "Dernière occurrence",
    ]
      .map(champ)
      .join(";"),
  ];

  for (const r of page.lignes) {
    const vn = r.normaux ? valeurs(r.normaux, indexe) : null;
    const vt = r.ts ? valeurs(r.ts, indexe) : null;
    lignes.push(
      [
        champ(r.ouvrage.lotCode),
        champ(r.ouvrage.code),
        champ(r.ouvrage.libelleDevis),
        champ(r.ouvrage.unite ? LIBELLES_UNITES[r.ouvrage.unite] : ""),
        nombreFr(vn?.mediane ?? null),
        r.normaux?.n ?? "",
        nombreFr(vn?.min ?? null),
        nombreFr(vn?.max ?? null),
        nombreFr(vt?.mediane ?? null),
        r.ts?.n ?? "",
        nombreFr(r.deltaTs),
        champ(r.normaux?.fiabilite ?? r.ts?.fiabilite ?? ""),
        champ(
          r.normaux?.derniereOccurrence ?? r.ts?.derniereOccurrence ?? "",
        ),
      ].join(";"),
    );
  }

  return new Response("\uFEFF" + lignes.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sodobat-prix-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
