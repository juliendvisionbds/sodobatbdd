// Ligne d'état de la base, sous le titre de page : ce que la base
// contient et quand elle a été alimentée pour la dernière fois.

import Link from "next/link";
import { lireSession } from "@/lib/session-serveur";
import type { SyntheseBase } from "@/lib/types";
import { entier, ilYa } from "./Vision";

export async function EtatBase({
  synthese: s,
  lienImport = true,
}: {
  synthese: SyntheseBase;
  /** masqué sur l'écran d'import lui-même */
  lienImport?: boolean;
}) {
  const session = await lireSession();
  return (
    <>
      <span>
        Base alimentée par vos pièces · {entier(s.nbDocuments)} devis et factures
        {" · "}
        {entier(s.nbLignes)} lignes · dernière pièce intégrée {ilYa(s.derniereEcriture)}
      </span>
      {lienImport && session?.estAdmin && (
        <Link href="/import" className="vx-link !text-[13px]">
          Voir le flux d&apos;import →
        </Link>
      )}
    </>
  );
}
