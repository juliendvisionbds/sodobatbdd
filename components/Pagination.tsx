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
    "flex h-8 min-w-8 items-center justify-center rounded-[7px] border border-control bg-surface px-2 text-[14px] text-sub transition-colors hover:border-petrole hover:bg-petrole-wash hover:text-petrole disabled:pointer-events-none disabled:opacity-40";

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-1.5 pt-4"
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
              className={`flex h-8 min-w-8 items-center justify-center rounded-[7px] border px-2 text-[13px] transition-colors ${
                n === page
                  ? "border-petrole bg-petrole font-semibold text-white"
                  : "border-control bg-surface text-sub hover:border-petrole hover:bg-petrole-wash hover:text-petrole"
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
