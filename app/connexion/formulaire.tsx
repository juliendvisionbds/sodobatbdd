"use client";

import { useActionState } from "react";
import { connecter, type EtatConnexion } from "@/lib/actions/auth";

const ETAT_INITIAL: EtatConnexion = { erreur: null };

export function FormulaireConnexion({ suite }: { suite: string }) {
  const [etat, action, enCours] = useActionState(connecter, ETAT_INITIAL);

  return (
    <form action={action}>
      <input type="hidden" name="suite" value={suite} />
      <label
        htmlFor="code"
        className="vx-kpi__label mb-1.5 block"
      >
        Code d&apos;accès
      </label>
      <input
        id="code"
        name="code"
        type="password"
        autoFocus
        autoComplete="current-password"
        className="vx-input mono w-full !text-[15px]"
        placeholder="••••••••••"
      />
      {etat.erreur && (
        <p className="mt-3 rounded-[9px] border border-red/25 bg-red-bg px-3 py-2 text-[13.5px] text-red">
          {etat.erreur}
        </p>
      )}
      <button
        type="submit"
        disabled={enCours}
        className="vx-btn mt-4 w-full justify-center"
      >
        {enCours ? "Vérification…" : "Entrer"}
      </button>
    </form>
  );
}
