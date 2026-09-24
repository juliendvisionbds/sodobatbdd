// =====================================================================
// Fiche ouvrage — composant serveur : rassemble toutes les données
// puis délègue le rendu au panneau client. La table reste visible et
// utilisable derrière.
// =====================================================================

import { ouvrages } from "@/lib/queries";
import { lireSession } from "@/lib/session-serveur";
import type { FiltresPrix } from "@/lib/types";
import { FicheContenu } from "./FicheContenu";

export async function FicheOuvrage({
  id,
  filtres,
  idsPage,
  totalListe,
  positionListe,
}: {
  id: string;
  filtres: FiltresPrix;
  idsPage: string[];
  totalListe: number;
  positionListe: number | null;
}) {
  const ouvrage = await ouvrages.obtenirOuvrage(id);
  if (!ouvrage) {
    return (
      <div className="p-6 text-[13px] text-sub">Ouvrage introuvable.</div>
    );
  }

  const [normaux, ts, zones, serie, effet, cooc, lignes, forfaits, session] =
    await Promise.all([
      ouvrages.statsOuvrage(id, { ...filtres, typeTravaux: "normaux" }),
      ouvrages.statsOuvrage(id, { ...filtres, typeTravaux: "ts" }),
      ouvrages.statsParZone(id, { ...filtres, typeTravaux: "tous" }),
      ouvrages.serieTemporelle(id, { ...filtres, typeTravaux: "tous" }),
      ouvrages.effetQuantite(id, filtres),
      ouvrages.cooccurrences(id, 5),
      ouvrages.lignesSources(id, { ...filtres, typeTravaux: "tous" }, 1),
      ouvrage.estForfaitaire ? ouvrages.statsForfait(id) : Promise.resolve([]),
      lireSession(),
    ]);

  return (
    <FicheContenu
      ouvrage={ouvrage}
      normaux={normaux}
      ts={ts}
      zones={zones}
      serie={serie}
      effetQuantite={effet}
      cooccurrences={cooc}
      lignes={lignes.lignes}
      forfaits={forfaits}
      indexe={filtres.indexe !== false}
      peutModifier={session?.estAdmin ?? false}
      idsPage={idsPage}
      totalListe={totalListe}
      positionListe={positionListe}
    />
  );
}
