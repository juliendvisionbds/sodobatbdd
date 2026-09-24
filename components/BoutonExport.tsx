"use client";

// Export CSV du résultat filtré : mêmes paramètres d'URL, route serveur.

import { useSearchParams } from "next/navigation";

export function BoutonExport() {
  const params = useSearchParams();
  const href = `/api/export${params.size > 0 ? `?${params.toString()}` : ""}`;
  return (
    <a
      href={href}
      download
      className="vx-btn-outline"
    >
      Exporter en CSV
    </a>
  );
}
