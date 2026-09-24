// Bandeau d'état d'une opération (design system : Alert). Sans hook :
// utilisable en composant serveur comme client.

export function Alerte({
  ton = "info",
  enCours = false,
  titre,
  corps,
  actions,
  className = "",
}: {
  ton?: "info" | "warn" | "pos" | "neg";
  /** Affiche le spinner à la place de l'icône. */
  enCours?: boolean;
  titre: React.ReactNode;
  corps?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`vx-alert ${ton !== "info" ? `vx-alert--${ton}` : ""} ${className}`}
    >
      {enCours ? (
        <span className="vx-spinner" aria-hidden />
      ) : (
        <span className={`vx-alert__icon ${ton === "pos" ? "vx-alert__icon--ok" : ""}`} aria-hidden />
      )}
      <div className="min-w-0">
        <div className="vx-alert__title">{titre}</div>
        {corps && <div className="vx-alert__body">{corps}</div>}
      </div>
      {actions && <div className="vx-alert__actions">{actions}</div>}
    </div>
  );
}
