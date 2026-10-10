// =====================================================================
// Briques de mise en page du design system Sodobat (classes vx-*).
// Ordre d'une vue : titre de page -> bandeau de KPI -> panneaux.
// =====================================================================

export function TitrePage({
  titre,
  chapo,
  meta,
  actions,
}: {
  titre: string;
  chapo?: React.ReactNode;
  /** ligne de métadonnées sous le chapô (état de la base, période…) */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="vx-heading">
      <div>
        <h1 className="vx-heading__title">{titre}</h1>
        {chapo && <p className="vx-heading__lead">{chapo}</p>}
        {meta && <div className="vx-heading__meta">{meta}</div>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function Kpi({
  libelle,
  valeur,
  sous,
  ton,
}: {
  libelle: string;
  valeur: React.ReactNode;
  sous?: React.ReactNode;
  ton?: "pos" | "neg";
}) {
  return (
    <div className="vx-kpi">
      <div className="vx-kpi__label">{libelle}</div>
      <div className="vx-kpi__value">{valeur}</div>
      {sous && (
        <div className={`vx-kpi__sub ${ton ? `vx-kpi__sub--${ton}` : ""}`}>
          {sous}
        </div>
      )}
    </div>
  );
}

export function RangeeKpi({ enfants }: { enfants: React.ReactNode }) {
  return <div className="vx-kpis mb-5">{enfants}</div>;
}

export function Panneau({
  titre,
  meta,
  description,
  actions,
  enfants,
  pied,
  aRas = false,
  className = "",
  corpsClassName = "",
}: {
  titre?: React.ReactNode;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  enfants: React.ReactNode;
  /** note de lecture sous le contenu, séparée par un filet */
  pied?: React.ReactNode;
  /** contenu bord à bord (tableau) : l'en-tête garde seul sa marge */
  aRas?: boolean;
  className?: string;
  corpsClassName?: string;
}) {
  const aEntete = titre || meta || actions;
  const decale = !aRas && (aEntete || description);
  return (
    <section className={`vx-panel ${aRas ? "vx-panel--flush" : ""} ${className}`}>
      {aEntete && (
        <div className="vx-panel__head">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {titre && <h2 className="vx-panel__title">{titre}</h2>}
            {meta && <span className="vx-panel__meta">{meta}</span>}
          </div>
          {actions && <div className="flex items-center gap-2.5">{actions}</div>}
        </div>
      )}
      {description && (
        <p className={`vx-panel__desc ${aRas ? "px-6 pt-3" : "mt-1"}`}>{description}</p>
      )}
      <div className={decale ? `mt-4 ${corpsClassName}` : corpsClassName}>
        {enfants}
      </div>
      {pied && (
        <div className={`vx-panel__foot ${aRas ? "" : "-mx-6 -mb-[22px] mt-4"}`}>{pied}</div>
      )}
    </section>
  );
}

/** « il y a 2 min », « il y a 3 h », « il y a 4 j » — ou la date. */
export function ilYa(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j <= 30) return `il y a ${j} j`;
  return `le ${new Intl.DateTimeFormat("fr-FR").format(new Date(iso))}`;
}

/** Nombre entier au format français (espace fine en séparateur). */
export function entier(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}
