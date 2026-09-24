// Badge de statut d'une pièce (document) — utilisable en composant
// serveur comme client (aucun hook).

import type { ControleLigne, StatutDocument } from "@/lib/types";

const STATUTS: Record<StatutDocument, { classe: string; libelle: string; titre: string }> = {
  a_revoir: {
    classe: "b-red",
    libelle: "à revoir",
    titre: "Le total imprimé ne correspond pas à la somme des lignes. Les lignes cohérentes comptent déjà dans les prix.",
  },
  valide: { classe: "b-green", libelle: "validée", titre: "Pièce validée" },
  rejete: {
    classe: "b-neutre",
    libelle: "rejetée",
    titre: "Pièce rejetée : aucune de ses lignes ne compte dans les prix.",
  },
  importe: { classe: "b-amber", libelle: "importée", titre: "Pièce importée, non contrôlée" },
};

export function BadgeStatutDocument({
  statut,
  controleLigne,
  className = "",
}: {
  statut: StatutDocument;
  /** Si 'ecart', ajoute un second badge « écart ligne ». */
  controleLigne?: ControleLigne;
  className?: string;
}) {
  const s = STATUTS[statut];
  return (
    <>
      {statut !== "valide" && (
        <span className={`badge ${s.classe} ${className}`} title={s.titre}>
          {s.libelle}
        </span>
      )}
      {controleLigne === "ecart" && (
        <span
          className={`badge b-amber ${className}`}
          title="Quantité × PU ≠ total imprimé : cette ligne est exclue des prix."
        >
          écart ligne
        </span>
      )}
    </>
  );
}
