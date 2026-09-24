"use client";

// =====================================================================
// Table des prix — TanStack Table v8, tri et pagination pilotés par
// l'URL (le serveur fait tout le travail). Sous 768px : cartes
// empilées, jamais de scroll horizontal.
// =====================================================================

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useSearchParams } from "next/navigation";
import { useParamsUrl } from "./useParamsUrl";
import { CellulePrix, ReglettePrix, EtiquetteN } from "./ReglettePrix";
import { Pagination } from "./Pagination";
import {
  date as fmtDate,
  euro,
  valeurs,
  LIBELLES_UNITES,
  type ColonneTriPrix,
  type LotNoeud,
  type OuvrageResume,
  type Page,
  type Tri,
} from "@/lib/types";

const aide = createColumnHelper<OuvrageResume>();

function dispersionPct(r: OuvrageResume, indexe: boolean): number | null {
  const s = r.normaux ?? r.ts;
  if (!s) return null;
  const q = indexe ? s.quartilesIndexes : s.quartiles;
  if (!q || q.p25 <= 0) return null;
  return Math.round((q.p75 / q.p25 - 1) * 100);
}

function derniereOcc(r: OuvrageResume): string | null {
  const dates = [r.normaux?.derniereOccurrence, r.ts?.derniereOccurrence]
    .filter((d): d is string => Boolean(d))
    .sort();
  return dates.at(-1) ?? null;
}

export function TableauPrix({
  page,
  indexe,
  tri,
  lots,
  baseVide,
  estAdmin = false,
}: {
  page: Page<OuvrageResume>;
  indexe: boolean;
  tri: Tri<ColonneTriPrix>;
  lots: LotNoeud[];
  baseVide: boolean;
  estAdmin?: boolean;
}) {
  const { modifier } = useParamsUrl();
  const params = useSearchParams();
  const ouvrageOuvert = params.get("ouvrage");
  const sansPrix = params.get("sansprix") === "1";

  const colonnes = [
    aide.accessor((r) => r.ouvrage.lotCode, {
      id: "lot",
      header: "Lot",
      cell: (c) => (
        <span className="mono text-[12px] text-faint">{c.getValue() ?? "—"}</span>
      ),
    }),
    aide.accessor((r) => r.ouvrage.libelleDevis, {
      id: "libelle",
      header: "Ouvrage",
      cell: (c) => (
        <span className="line-clamp-2 text-[14px] leading-snug">
          {c.getValue()}
        </span>
      ),
    }),
    aide.accessor((r) => r.ouvrage.unite, {
      id: "unite",
      header: "U.",
      cell: (c) => {
        const u = c.getValue();
        return (
          <span className="vx-cell-muted">
            {u ? LIBELLES_UNITES[u] : "—"}
          </span>
        );
      },
    }),
    aide.accessor((r) => r.normaux, {
      id: "prix_normaux",
      header: "Prix normaux",
      cell: (c) => <CellulePrix stats={c.getValue()} indexe={indexe} />,
    }),
    aide.accessor((r) => r.ts, {
      id: "prix_ts",
      header: "Prix TS",
      cell: (c) => <CellulePrix stats={c.getValue()} indexe={indexe} ts />,
    }),
    aide.accessor((r) => dispersionPct(r, indexe), {
      id: "dispersion",
      header: "Écart",
      cell: (c) => {
        const v = c.getValue();
        if (v === null) return <span className="text-faint">—</span>;
        return (
          <span
            className={`mono text-[13px] ${v > 40 ? "font-medium" : ""}`}
            style={{ color: v > 40 ? "var(--warning)" : "var(--ink-muted)" }}
          >
            {v} %
          </span>
        );
      },
    }),
    aide.accessor((r) => derniereOcc(r), {
      id: "derniere_occurrence",
      header: "Dernière occ.",
      cell: (c) => (
        <span className="mono text-[13px] text-sub">{fmtDate(c.getValue())}</span>
      ),
    }),
  ];

  const table = useReactTable({
    data: page.lignes,
    columns: colonnes,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  const trier = (colonne: string) => {
    if (tri.colonne === colonne) {
      modifier({ sens: tri.sens === "asc" ? "desc" : "asc", tri: colonne });
    } else {
      modifier({ tri: colonne, sens: "asc" });
    }
  };

  const ouvrir = (id: string) => modifier({ ouvrage: id }, true);

  const masqueLarge = (id: string) =>
    id === "dispersion" || id === "derniere_occurrence"
      ? "hidden min-[1440px]:table-cell"
      : "";

  // ---------- états vides ----------
  if (page.total === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
        {baseVide ? (
          <>
            <p className="vx-panel__title">Aucun prix pour le moment.</p>
            <p className="max-w-[460px] text-[14px] text-sub">
              Les prix apparaissent dès que des pièces sont importées puis
              rattachées à un ouvrage dans le calage.
            </p>
            {estAdmin && (
              <a href="/calage" className="vx-btn-outline">Ouvrir le calage</a>
            )}
          </>
        ) : (
          <>
            <p className="vx-panel__title">Aucun ouvrage ne correspond à ces filtres.</p>
            <button
              type="button"
              onClick={() =>
                modifier({
                  q: null, lot: null, zones: null, type: null, unites: null,
                  depuis: null, jusqua: null, nmin: null, fiab: null,
                  sansprix: null,
                })
              }
              className="vx-btn-outline"
            >
              Effacer les filtres
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1">
      {/* ---------- sélecteur de lot mobile ---------- */}
      <div className="pb-3 lg:hidden">
        <select
          aria-label="Filtrer par lot"
          value={params.get("lot") ?? ""}
          onChange={(e) => modifier({ lot: e.target.value || null })}
          className="vx-select w-full"
        >
          <option value="">Tous les lots</option>
          {lots.flatMap((l) => [
            <option key={l.id} value={l.id}>
              {l.libelle} ({sansPrix ? l.nbOuvragesCumule : l.nbAvecPrixCumule})
            </option>,
            ...l.enfants.map((e) => (
              <option key={e.id} value={e.id}>
                — {e.libelle} ({sansPrix ? e.nbOuvragesCumule : e.nbAvecPrixCumule})
              </option>
            )),
          ])}
        </select>
      </div>

      {/* ---------- table (>= 768px) ---------- */}
      <div className="hidden md:block">
        <table className="vx-tbl">
          <thead>
            {table.getHeaderGroups().map((groupe) => (
              <tr key={groupe.id}>
                {groupe.headers.map((h) => (
                  <th
                    key={h.id}
                    aria-sort={
                      tri.colonne === h.column.id
                        ? tri.sens === "asc" ? "ascending" : "descending"
                        : undefined
                    }
                    className={masqueLarge(h.column.id)}
                  >
                    <button
                      type="button"
                      onClick={() => trier(h.column.id)}
                      className={`cursor-pointer whitespace-nowrap uppercase tracking-[.04em] hover:text-navy ${
                        tri.colonne === h.column.id ? "text-navy" : ""
                      }`}
                      aria-label={`Trier par ${String(h.column.columnDef.header)}`}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {tri.colonne === h.column.id && (
                        <span aria-hidden> {tri.sens === "asc" ? "↑" : "↓"}</span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((rangee) => {
              const id = rangee.original.ouvrage.id;
              const ouverte = ouvrageOuvert === id;
              return (
                <tr
                  key={rangee.id}
                  tabIndex={0}
                  onClick={() => ouvrir(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      ouvrir(id);
                    }
                  }}
                  aria-label={`Ouvrir la fiche : ${rangee.original.ouvrage.libelleDevis}`}
                  aria-selected={ouverte}
                  className="vx-tbl__row"
                >
                  {rangee.getVisibleCells().map((cellule) => (
                    <td
                      key={cellule.id}
                      className={masqueLarge(cellule.column.id)}
                    >
                      {flexRender(cellule.column.columnDef.cell, cellule.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- cartes empilées (< 768px) ---------- */}
      <div className="space-y-2 md:hidden">
        {page.lignes.map((r) => {
          const vn = r.normaux ? valeurs(r.normaux, indexe) : null;
          const vt = r.ts ? valeurs(r.ts, indexe) : null;
          return (
            <button
              key={r.ouvrage.id}
              type="button"
              onClick={() => ouvrir(r.ouvrage.id)}
              className="block w-full rounded-[10px] border border-line bg-surface p-3.5 text-left transition-colors hover:border-navy hover:bg-navy-tint"
            >
              <div className="mono text-[12px] text-faint">
                {r.ouvrage.lotCode ?? "—"} ·{" "}
                {r.ouvrage.unite ? LIBELLES_UNITES[r.ouvrage.unite] : "—"}
              </div>
              <div className="mt-0.5 text-[14px] leading-snug">
                {r.ouvrage.libelleDevis}
              </div>
              {vn && r.normaux && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-[64px] text-[12px] text-faint">Normaux</span>
                  <span className="vx-cell-key !text-left">{euro(vn.mediane)}</span>
                  <ReglettePrix stats={r.normaux} indexe={indexe} />
                  <EtiquetteN n={r.normaux.n} />
                </div>
              )}
              {vt && r.ts && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="w-[64px] text-[12px] text-faint">TS</span>
                  <span className="mono text-[13px]" style={{ color: "var(--ts)" }}>
                    {euro(vt.mediane)}
                  </span>
                  <ReglettePrix stats={r.ts} indexe={indexe} ts />
                  <EtiquetteN n={r.ts.n} />
                  {r.deltaTs !== null && (
                    <span className="mono text-[11px]" style={{ color: "var(--ts)" }}>
                      {r.deltaTs > 0 ? "+" : ""}
                      {Math.round(r.deltaTs)} %
                    </span>
                  )}
                </div>
              )}
              {!vn && !vt && <div className="mt-2 text-[12.5px] text-faint">Aucune occurrence</div>}
            </button>
          );
        })}
      </div>

      {/* ---------- pagination ---------- */}
      <Pagination page={page.page} total={page.total} parPage={page.parPage} />
    </div>
  );
}
