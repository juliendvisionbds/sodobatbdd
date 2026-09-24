"use client";

// Bouton de relance d'un import en échec (le fichier est repris dans
// Storage et repasse tout le pipeline).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { relancerImportAction } from "@/lib/actions/import";

export function ImportRelance({
  importId,
  libelle = "Relancer",
}: {
  importId: string;
  libelle?: string;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            setErreur(null);
            try {
              const bilan = await relancerImportAction(importId);
              if (bilan.statut === "erreur") setErreur(bilan.erreur ?? "Échec.");
              router.refresh();
            } catch (e) {
              setErreur(e instanceof Error ? e.message : String(e));
            }
          })
        }
        className="vx-btn-outline !px-2.5 !py-1 !text-[12.5px]"
      >
        {enCours ? "Relance…" : libelle}
      </button>
      {erreur && <span className="text-[12px] text-red">{erreur}</span>}
    </span>
  );
}
