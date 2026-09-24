"use client";

// Création d'un ouvrage canonique depuis une ligne de devis (touche N du
// calage, « Nouvel ouvrage » de la file sans ouvrage). La ligne est
// rattachée et validée dans la foulée.

import { useEffect, useRef, useTransition } from "react";
import { creerOuvrageDepuisLigneAction } from "@/lib/actions/calage";
import { LIBELLES_UNITES, type CodeUnite } from "@/lib/types";
import { Superposee } from "./Superposee";

const UNITES: CodeUnite[] = [
  "m2", "ml", "m3", "u", "kg", "h", "j", "ens", "forfait",
];

export function FormulaireNouvelOuvrage({
  ligneId,
  designation,
  unite,
  lots,
  fermer,
  apres,
}: {
  ligneId: string;
  designation: string;
  unite: CodeUnite | null;
  lots: Array<{ id: string; code: string; libelle: string }>;
  fermer: () => void;
  apres: (ids: string[]) => void;
}) {
  const [enCours, demarrer] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const soumettre = (form: FormData) => {
    demarrer(async () => {
      const ids = await creerOuvrageDepuisLigneAction(ligneId, {
        libelleDevis: String(form.get("libelle") ?? designation),
        libelleNormalise:
          String(form.get("normalise") ?? "").trim() || undefined,
        code: String(form.get("code") ?? "").trim() || undefined,
        lotId: String(form.get("lot") ?? "") || undefined,
        unite: (String(form.get("unite") ?? "") || undefined) as
          | CodeUnite
          | undefined,
        estForfaitaire: form.get("forfait") === "on",
      });
      apres(ids);
    });
  };

  return (
    <Superposee titre="Nouvel ouvrage canonique" fermer={fermer}>
      <form action={soumettre} className="flex flex-col gap-3">
        <label className="text-[13px] font-semibold text-sub">
          Libellé devis (affiché)
          <input
            ref={ref}
            name="libelle"
            defaultValue={designation}
            required
            className="vx-input mt-1 w-full !min-w-0"
          />
        </label>
        <label className="text-[13px] font-semibold text-sub">
          Libellé normalisé (rapprochement) — vide = déduit du libellé
          <input
            name="normalise"
            className="vx-input mt-1 w-full !min-w-0"
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-[13px] font-semibold text-sub">
            Code
            <input
              name="code"
              placeholder="CM-IPN-160"
              className="vx-input mono mt-1 w-full !min-w-0"
            />
          </label>
          <label className="text-[13px] font-semibold text-sub">
            Lot
            <select name="lot" className="vx-select mt-1 w-full">
              <option value="">—</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-semibold text-sub">
            Unité
            <select
              name="unite"
              defaultValue={unite ?? ""}
              className="vx-select mt-1 w-full"
            >
              <option value="">—</option>
              {UNITES.map((u) => (
                <option key={u} value={u}>
                  {LIBELLES_UNITES[u]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="forfait" className="accent-[var(--navy)]" />
          Ouvrage forfaitaire (prix au forfait, pas à l&apos;unité)
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={fermer} className="vx-btn-outline">
            Annuler
          </button>
          <button
            type="submit"
            disabled={enCours}
            className="vx-btn !px-4 !py-2 !text-[14px]"
          >
            {enCours ? "Création…" : "Créer et rattacher"}
          </button>
        </div>
      </form>
    </Superposee>
  );
}
