"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Met à jour les paramètres d'URL (état unique de l'écran).
 *  Toute modification de filtre revient à la page 1. */
export function useParamsUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const modifier = useCallback(
    (changements: Record<string, string | null>, garderPage = false) => {
      const suivants = new URLSearchParams(params.toString());
      for (const [cle, valeur] of Object.entries(changements)) {
        if (valeur === null || valeur === "") suivants.delete(cle);
        else suivants.set(cle, valeur);
      }
      if (!garderPage && !("page" in changements)) suivants.delete("page");
      const chaine = suivants.toString();
      router.replace(chaine ? `${pathname}?${chaine}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, params],
  );

  return { params, modifier };
}
