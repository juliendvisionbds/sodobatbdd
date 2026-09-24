"use client";

// Pagination pilotée par l'URL, partagée entre les écrans.

import { useParamsUrl } from "./useParamsUrl";

export function Pagination({
  page,
  total,
  parPage,
}: {
  page: number;
  total: number;
  parPage: number;
}) {
  const { modifier } = useParamsUrl();
  const nbPages = Math.max(1, Math.ceil(total / parPage));
  if (nbPages <= 1) return null;

  const fleche =
    "flex h-8 min-w-8 items-center justify-center rounded-[8px] border border-line bg-surface px-2 text-[14px] text-sub transition-colors hover:border-navy hover:bg-navy-tint hover:text-navy disabled:pointer-events-none disabled:opacity-40";

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-1.5 pt-5"
    >
      <button
        type="button"
        aria-label="Page précédente"
        disabled={page <= 1}
        onClick={() => modifier({ page: String(page - 1) }, true)}
        className={fleche}
      >
        ‹
      </button>
      {Array.from({ length: nbPages }, (_, i) => i + 1)
        .filter((n) => n === 1 || n === nbPages || Math.abs(n - page) <= 2)
        .map((n, i, liste) => (
          <span key={n} className="flex items-center gap-1.5">
            {i > 0 && liste[i - 1] !== n - 1 && (
              <span className="px-0.5 text-faint">…</span>
            )}
            <button
              type="button"
              aria-current={n === page ? "page" : undefined}
              onClick={() => modifier({ page: String(n) }, true)}
              className={`mono flex h-8 min-w-8 items-center justify-center rounded-[8px] border px-2 text-[13px] transition-colors ${
                n === page
                  ? "border-navy bg-navy font-medium text-white"
                  : "border-line bg-surface text-sub hover:border-navy hover:bg-navy-tint hover:text-navy"
              }`}
            >
              {n}
            </button>
          </span>
        ))}
      <button
        type="button"
        aria-label="Page suivante"
        disabled={page >= nbPages}
        onClick={() => modifier({ page: String(page + 1) }, true)}
        className={fleche}
      >
        ›
      </button>
    </nav>
  );
}
