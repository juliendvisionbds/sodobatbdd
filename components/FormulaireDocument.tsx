"use client";

// Formulaire « Informations de la pièce » : date, type, TS, numéro,
// client, chantier, zone. Utilisé dans le calage (Documents) et dans
// l'historique (administrateur). Rien n'est deviné : ce que l'humain
// saisit devient la référence (date_source = humain, zone fiable).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { modifierDocumentAction } from "@/lib/actions/documents";
import {
  LIBELLES_ZONES,
  type ChampsDocument,
  type CodeZone,
  type TypeDocument,
} from "@/lib/types";

export interface DocumentEditable {
  id: string;
  date: string | null;
  typeDocument: TypeDocument;
  estTs: boolean;
  numero: string | null;
  client: string | null;
  chantierObjet: string | null;
  chantierCodePostal: string | null;
  chantierCommune: string | null;
  zone: CodeZone | null;
}

const TYPES: Array<[TypeDocument, string]> = [
  ["devis", "Devis / DPGF"],
  ["facture", "Facture"],
  ["situation", "Situation"],
  ["avenant", "Avenant"],
  ["indetermine", "Indéterminé"],
];

export function FormulaireDocument({
  doc,
  fermer,
  apres,
}: {
  doc: DocumentEditable;
  fermer: () => void;
  apres?: (champs: ChampsDocument) => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const soumettre = (form: FormData) => {
    const v = (k: string) => String(form.get(k) ?? "").trim();
    const champs: ChampsDocument = {
      dateDocument: v("date") || null,
      typeDocument: v("type") as TypeDocument,
      estTs: form.get("ts") === "on",
      numero: v("numero") || null,
      chantierObjet: v("objet") || null,
      chantierCodePostal: v("cp") || null,
      chantierCommune: v("commune") || null,
      zoneCode: (v("zone") || null) as CodeZone | null,
    };
    const client = v("client");
    if (client && client !== (doc.client ?? "")) champs.clientNom = client;
    demarrer(async () => {
      try {
        await modifierDocumentAction(doc.id, champs);
        apres?.(champs);
        fermer();
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const champ = "vx-input mt-1 w-full !min-w-0 !py-[7px] !text-[13.5px]";
  const etiquette = "text-[12.5px] font-semibold text-sub";

  return (
    <form
      action={soumettre}
      onKeyDown={(e) => {
        if (e.key === "Escape") fermer();
      }}
      className="mt-3 grid grid-cols-2 gap-3 rounded-[10px] border border-navy-line bg-navy-tint p-4 md:grid-cols-4"
    >
      <label className={etiquette}>
        Date de la pièce
        <input name="date" type="date" defaultValue={doc.date ?? ""} className={champ} />
      </label>
      <label className={etiquette}>
        Type
        <select name="type" defaultValue={doc.typeDocument} className="vx-select mt-1 w-full !py-[7px] !text-[13.5px]">
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className={etiquette}>
        Numéro
        <input name="numero" defaultValue={doc.numero ?? ""} className={champ} />
      </label>
      <label className="flex items-end gap-2 pb-2 text-[13px]">
        <input type="checkbox" name="ts" defaultChecked={doc.estTs} className="accent-[var(--navy)]" />
        Travaux supplémentaires
      </label>
      <label className={`${etiquette} col-span-2`}>
        Client
        <input name="client" defaultValue={doc.client ?? ""} placeholder="Nom du client (créé s'il est inconnu)" className={champ} />
      </label>
      <label className={`${etiquette} col-span-2`}>
        Objet du chantier
        <input name="objet" defaultValue={doc.chantierObjet ?? ""} className={champ} />
      </label>
      <label className={etiquette}>
        Code postal chantier
        <input name="cp" defaultValue={doc.chantierCodePostal ?? ""} inputMode="numeric" className={champ} />
      </label>
      <label className={etiquette}>
        Commune chantier
        <input name="commune" defaultValue={doc.chantierCommune ?? ""} className={champ} />
      </label>
      <label className={etiquette}>
        Zone de prix
        <select name="zone" defaultValue={doc.zone ?? ""} className="vx-select mt-1 w-full !py-[7px] !text-[13.5px]">
          <option value="">— déduite du code postal —</option>
          {(Object.keys(LIBELLES_ZONES) as CodeZone[]).map((z) => (
            <option key={z} value={z}>{LIBELLES_ZONES[z]}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end justify-end gap-2">
        <button type="button" onClick={fermer} className="vx-btn-ghost">Annuler</button>
        <button type="submit" disabled={enCours} className="vx-btn !px-4 !py-2 !text-[14px]">
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {erreur && <p className="col-span-full text-[12.5px] text-red">{erreur}</p>}
    </form>
  );
}

/** Bouton + formulaire repliable, pour un composant serveur (historique). */
export function BoutonModifierDocument({ doc }: { doc: DocumentEditable }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <span className="block">
      <button type="button" onClick={() => setOuvert((o) => !o)} className="vx-btn-outline !py-1.5 !text-[12.5px]">
        {ouvert ? "Fermer" : "Modifier la pièce"}
      </button>
      {ouvert && <FormulaireDocument doc={doc} fermer={() => setOuvert(false)} />}
    </span>
  );
}
