// =====================================================================
// En-tête commun (design system Sodobat), sur une ligne : marque,
// onglets de navigation soulignés, période couverte et utilisateur.
// =====================================================================

import Image from "next/image";
import Link from "next/link";
import { lireSession } from "@/lib/session-serveur";
import { referentiel } from "@/lib/queries";
import type { SyntheseBase } from "@/lib/types";
import { MenuUtilisateur } from "./MenuUtilisateur";

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
    <header className="vx-header max-md:static">
      <Link href="/" className="vx-brand" aria-label="Accueil — tarifs ouvrages">
        <Image
          src="/sodobat.jpeg"
          alt=""
          width={32}
          height={32}
          priority
          className="h-8 w-8 shrink-0 rounded-[8px] object-cover"
        />
        <div>
          <div className="vx-brand__title">Sodobat</div>
          <div className="vx-brand__sub">Base de données intelligente</div>
        </div>
      </Link>
      <nav className="vx-tabs" aria-label="Navigation principale">
        {onglet("/", "Tarifs ouvrages", "prix")}
        {onglet("/frais", "Frais de chantier", "frais")}
        {onglet("/historique", "Historique des chantiers", "historique")}
        {onglet("/chat", "Assistant IA", "chat")}
        {session?.estAdmin && onglet("/calage", "Calage", "calage")}
        {session?.estAdmin && onglet("/import", "Import", "import")}
      </nav>
      <div className="vx-header__side">
        {annees && <span className="vx-header__chip max-lg:hidden">Pièces {annees}</span>}
        <MenuUtilisateur libelle={session?.libelle} estAdmin={session?.estAdmin ?? false} />
      </div>
    </header>
  );
}
