// =====================================================================
// En-tête commun (design system Vision) : marque, utilisateur, onglets
// de navigation, puis bandeau d'état de la base.
// =====================================================================

import Image from "next/image";
import Link from "next/link";
import { lireSession } from "@/lib/session-serveur";
import { referentiel } from "@/lib/queries";
import type { SyntheseBase } from "@/lib/types";
import { MenuUtilisateur } from "./MenuUtilisateur";
import { entier, ilYa } from "./Vision";

type Onglet = "prix" | "frais" | "historique" | "chat" | "calage" | "import";

export async function EnTete({
  actif,
  synthese,
  bascule = false,
}: {
  actif: Onglet;
  /** déjà chargée par la page : évite une seconde requête */
  synthese?: SyntheseBase;
  /** conservé pour compatibilité : la bascule prix actualisés a été retirée */
  bascule?: boolean;
}) {
  const session = await lireSession();
  const s = synthese ?? (await referentiel.synthese());

  const annees =
    s.premiereDate && s.derniereDate
      ? `${s.premiereDate.slice(0, 4)} → ${s.derniereDate.slice(0, 4)}`
      : null;

  const onglet = (href: string, libelle: string, cle: Onglet) => (
    <Link
      href={href}
      className="vx-tab"
      aria-current={actif === cle ? "page" : undefined}
    >
      {libelle}
    </Link>
  );

  return (
    <>
      <header className="vx-header max-md:static">
        <div className="vx-wrap">
          <div className="vx-header__top">
            <Link href="/" className="vx-brand" aria-label="Accueil — tarifs ouvrages">
              <Image
                src="/sodobat.jpeg"
                alt="Sodobat"
                width={46}
                height={46}
                priority
                className="h-[46px] w-[46px] shrink-0 rounded-[9px] object-cover"
              />
              <div>
                <div className="vx-brand__title">Base de données intelligente</div>
                <div className="vx-brand__sub">
                  Sodobat · prix d&apos;ouvrages{annees ? ` · ${annees}` : ""}
                </div>
              </div>
            </Link>
            <div className="vx-spacer" />
            <MenuUtilisateur libelle={session?.libelle} estAdmin={session?.estAdmin ?? false} />
          </div>
          <nav className="vx-tabs" aria-label="Navigation principale">
            {onglet("/", "Tarifs ouvrages", "prix")}
            {onglet("/frais", "Frais de chantier", "frais")}
            {onglet("/historique", "Historique des chantiers", "historique")}
            {onglet("/chat", "Assistant IA", "chat")}
            {session?.estAdmin && onglet("/calage", "Calage", "calage")}
            {session?.estAdmin && onglet("/import", "Import", "import")}
          </nav>
        </div>
      </header>

      <div className="vx-banner">
        <div className="vx-wrap vx-banner__inner">
          <span className="vx-banner__dot" aria-hidden />
          <span>
            <strong className="font-semibold">Base alimentée par vos pièces</strong>
            {" : "}
            {entier(s.nbDocuments)} devis et factures, {entier(s.nbLignes)} lignes
            {" · "}dernière pièce intégrée {ilYa(s.derniereEcriture)}
          </span>
          {session?.estAdmin && actif !== "import" && (
            <Link href="/import" className="vx-btn-ghost ml-auto">
              Voir le flux d&apos;import
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
