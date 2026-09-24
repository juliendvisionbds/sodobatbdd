"use client";

// Bascule « Prix actualisés / Prix bruts ». Ne déclenche aucune requête
// supplémentaire : les deux jeux de valeurs sont déjà dans StatsPrix.

import { useParamsUrl } from "./useParamsUrl";

export function BasculeIndexe() {
  const { params, modifier } = useParamsUrl();
  const indexe = params.get("prix") !== "bruts";

  return (
    <div className="flex items-center gap-2.5">
      <span className="hidden text-right text-[12px] leading-tight text-faint lg:block">
        {indexe ? (
          <>
            Prix ramenés
            <br />à aujourd&apos;hui
          </>
        ) : (
          <>
            Prix tels
            <br />qu&apos;imprimés
          </>
        )}
      </span>
      <div role="group" aria-label="Mode d'affichage des prix" className="vx-seg">
        <button
          type="button"
          aria-pressed={indexe}
          onClick={() => modifier({ prix: null }, true)}
          className="vx-seg__opt"
        >
          Prix actualisés
        </button>
        <button
          type="button"
          aria-pressed={!indexe}
          onClick={() => modifier({ prix: "bruts" }, true)}
          className="vx-seg__opt"
        >
          Prix bruts
        </button>
      </div>
    </div>
  );
}
