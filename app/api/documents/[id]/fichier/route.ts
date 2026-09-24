// =====================================================================
// GET /api/documents/:id/fichier — redirige vers un lien signé (1 h)
// du fichier source dans Supabase Storage. Le middleware exige déjà une
// session ; rien n'est exposé sans cookie valide.
// =====================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { lienSigne } from "@/lib/stockage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ erreur: "Identifiant invalide." }, { status: 400 });
  }
  const [doc] = await sql`
    select storage_path from documents where id = ${id}`;
  if (!doc?.storage_path) {
    return NextResponse.json({ erreur: "Pièce introuvable." }, { status: 404 });
  }
  const url = await lienSigne(doc.storage_path as string);
  if (!url) {
    return NextResponse.json(
      { erreur: "Fichier absent du stockage." },
      { status: 404 },
    );
  }
  return NextResponse.redirect(url, 302);
}
