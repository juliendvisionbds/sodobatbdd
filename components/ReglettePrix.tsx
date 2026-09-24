// =====================================================================
// ReglettePrix — composant signature.
// Un seul <svg>. La densité d'encre encode la fiabilité :
//   haute   -> interquartile plein, opacité 1
//   moyenne -> plein, opacité 0,55
//   faible  -> contour seul, médiane en tirets
// Pas de feux tricolores : la réglette suggère, le n= affirme.
// =====================================================================

import { IconeInfo, Infobulle, LigneInfo } from "./Infobulle";
import {
  valeurs,
  euro,
  type EuroHT,
  type ReglettePrixProps,
  type StatsPrix,
} from "@/lib/types";

const DIMENSIONS = {
  compacte: { largeur: 88, hauteur: 14, rect: 8 },
  detaillee: { largeur: 280, hauteur: 34, rect: 16 },
};

/** Échelle commune à deux réglettes (comparaison normaux / TS dans la
 *  fiche). Sans échelle commune, la comparaison visuelle ment. */
export function echelleCommune(
  a: StatsPrix | null,
  b: StatsPrix | null,
  indexe: boolean,
): { min: EuroHT; max: EuroHT } | undefined {
  const bornes = [a, b]
    .filter((s): s is StatsPrix => s !== null)
    .map((s) => valeurs(s, indexe));
  if (bornes.length === 0) return undefined;
  return {
    min: Math.min(...bornes.map((v) => v.min)),
    max: Math.max(...bornes.map((v) => v.max)),
  };
}

export function ReglettePrix({
  stats,
  indexe,
  echelle,
  largeur,
  variante = "compacte",
  ts = false,
}: ReglettePrixProps) {
  const dim = DIMENSIONS[variante];
  const L = largeur ?? dim.largeur;
  const detaillee = variante === "detaillee";
  const H = detaillee ? 34 : dim.hauteur;
  const hRegle = detaillee ? 18 : H;
  const yMilieu = hRegle / 2;

  const encre = ts ? "var(--ts)" : "var(--navy)";
  const trait = "var(--line-strong)";

  const v = valeurs(stats, indexe);
  const fiabilite = stats.fiabilite;

  const aria = `Prix médian ${euro(v.mediane)}, de ${euro(v.min)} à ${euro(
    v.max,
  )}, ${stats.n} occurrence${stats.n > 1 ? "s" : ""}, fiabilité ${fiabilite}`;

  // ----- n = 1 : un point plein, pas de réglette de largeur nulle -----
  if (stats.n === 1) {
    return (
      <svg
        role="img"
        aria-label={aria}
        width={L}
        height={H}
        viewBox={`0 0 ${L} ${H}`}
        className="shrink-0"
      >
        <circle cx={L / 2} cy={yMilieu} r={2} fill={encre} />
        {detaillee && (
          <text
            x={L / 2}
            y={H - 2}
            textAnchor="middle"
            fontSize={10}
            fill="var(--ink-faint)"
            fontFamily="var(--font-plex-mono), monospace"
          >
            {euro(v.mediane)}
          </text>
        )}
      </svg>
    );
  }

  // ----- min = max : dispersion nulle, signal fort et positif -----
  if (v.min === v.max) {
    return (
      <svg
        role="img"
        aria-label={aria}
        width={L}
        height={H}
        viewBox={`0 0 ${L} ${H}`}
        className="shrink-0"
      >
        <line
          x1={L / 2}
          y1={1}
          x2={L / 2}
          y2={hRegle - 1}
          stroke={encre}
          strokeWidth={3}
        />
        {detaillee && (
          <text
            x={L / 2}
            y={H - 2}
            textAnchor="middle"
            fontSize={10}
            fill="var(--ink-faint)"
            fontFamily="var(--font-plex-mono), monospace"
          >
            {euro(v.mediane)}
          </text>
        )}
      </svg>
    );
  }

  // ----- échelle -----
  let borneMin = echelle?.min ?? v.min;
  let borneMax = echelle?.max ?? v.max;
  let tronquee = false;
  // valeur aberrante écrasant l'échelle : tronquer à p75 × 1,5
  if (!echelle && v.quartiles && v.max > v.quartiles.p75 * 3) {
    borneMax = v.quartiles.p75 * 1.5;
    tronquee = true;
  }
  const marge = 3;
  const x = (val: number) => {
    const t = (val - borneMin) / (borneMax - borneMin || 1);
    return marge + Math.max(0, Math.min(1, t)) * (L - 2 * marge);
  };

  const opaciteRect =
    fiabilite === "haute" ? 1 : fiabilite === "moyenne" ? 0.55 : 0;
  const opaciteMediane =
    fiabilite === "haute" ? 1 : fiabilite === "moyenne" ? 0.8 : 0.6;

  const yRect = yMilieu - dim.rect / 2;
  const xFin = tronquee ? L - marge - 7 : x(Math.min(v.max, borneMax));

  return (
    <svg
      role="img"
      aria-label={aria}
      width={L}
      height={H}
      viewBox={`0 0 ${L} ${H}`}
      className="shrink-0"
    >
      {tronquee && <title>{`Maximum réel : ${euro(v.max)} (échelle tronquée)`}</title>}

      {/* étendue min -> max */}
      <line x1={x(v.min)} y1={yMilieu} x2={xFin} y2={yMilieu} stroke={trait} strokeWidth={1} />
      {/* embouts */}
      <line x1={x(v.min)} y1={yMilieu - 4} x2={x(v.min)} y2={yMilieu + 4} stroke={trait} strokeWidth={1} />
      {!tronquee && (
        <line x1={xFin} y1={yMilieu - 4} x2={xFin} y2={yMilieu + 4} stroke={trait} strokeWidth={1} />
      )}

      {/* interquartile p25 -> p75 (absent quand quartiles null : n = 2-3) */}
      {v.quartiles && (
        <rect
          x={x(v.quartiles.p25)}
          y={yRect}
          width={Math.max(x(Math.min(v.quartiles.p75, borneMax)) - x(v.quartiles.p25), 2)}
          height={dim.rect}
          rx={1}
          fill={opaciteRect > 0 ? encre : "none"}
          fillOpacity={opaciteRect}
          stroke={opaciteRect === 0 ? encre : "none"}
          strokeOpacity={0.7}
          strokeWidth={1}
        />
      )}

      {/* médiane : trait net, dépasse de 2px */}
      <line
        x1={x(v.mediane)}
        y1={yRect - 2}
        x2={x(v.mediane)}
        y2={yRect + dim.rect + 2}
        stroke={encre}
        strokeWidth={2}
        strokeOpacity={opaciteMediane}
        strokeDasharray={fiabilite === "faible" ? "2 2" : undefined}
      />

      {/* chevron de troncature */}
      {tronquee && (
        <g stroke={trait} strokeWidth={1.2} fill="none">
          <path d={`M ${L - marge - 6} ${yMilieu - 4} l 3.5 4 l -3.5 4`} />
          <path d={`M ${L - marge - 2.5} ${yMilieu - 4} l 3.5 4 l -3.5 4`} />
        </g>
      )}

      {/* valeurs chiffrées sous les repères (variante détaillée) */}
      {detaillee && (
        <g
          fontSize={10}
          fill="var(--ink-faint)"
          fontFamily="var(--font-plex-mono), monospace"
        >
          <text x={Math.max(x(v.min), 18)} y={H - 2} textAnchor="middle">
            {euro(v.min)}
          </text>
          {v.quartiles && x(v.quartiles.p25) - x(v.min) > 42 && (
            <text x={x(v.quartiles.p25)} y={H - 2} textAnchor="middle">
              {euro(v.quartiles.p25)}
            </text>
          )}
          <text
            x={x(v.mediane)}
            y={H - 2}
            textAnchor="middle"
            fill={encre}
            fontWeight={500}
          >
            {euro(v.mediane)}
          </text>
          {v.quartiles && x(v.max) - x(v.quartiles.p75) > 42 &&
            x(v.quartiles.p75) - x(v.mediane) > 42 && (
            <text x={x(v.quartiles.p75)} y={H - 2} textAnchor="middle">
              {euro(v.quartiles.p75)}
            </text>
          )}
          <text
            x={Math.min(xFin, L - 20)}
            y={H - 2}
            textAnchor="middle"
          >
            {euro(v.max)}{tronquee ? " »" : ""}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Le n= écrit en toutes lettres, mono. Ton « vigilance » quand n = 1. */
export function EtiquetteN({ n }: { n: number }) {
  const lecture =
    n >= 10
      ? "≥ 10 lignes : prix fiable si la dispersion est faible"
      : n >= 4
        ? "4 à 9 lignes : prix à confirmer"
        : n === 1
          ? "une seule ligne : ce n'est pas encore un prix de référence"
          : "moins de 4 lignes : peu de données";
  return (
    <span
      className={`mono text-[11.5px] ${n === 1 ? "font-medium" : ""}`}
      style={{ color: n === 1 ? "var(--warning)" : "var(--ink-faint)" }}
      title={`n = nombre de lignes de devis retenues. ${lecture}.`}
    >
      n={n}
    </span>
  );
}

/**
 * Cellule « Prix de référence » du tableau : médiane des travaux normaux
 * (repli sur TS si aucun normal), réglette, ⓘ avec bas/haut/moyenne/
 * min/max, badge TS quand des lignes TS existent.
 */
export function CellulePrix({
  normaux,
  ts,
  deltaTs,
  indexe,
}: {
  normaux: StatsPrix | null;
  ts: StatsPrix | null;
  deltaTs: number | null;
  indexe: boolean;
}) {
  const ref = normaux ?? ts;
  if (!ref) {
    return <span className="text-faint">—</span>;
  }
  const estTsSeul = normaux === null;
  const v = valeurs(ref, indexe);
  const vt = ts ? valeurs(ts, indexe) : null;
  return (
    <div className="flex items-center gap-2">
      <span
        className="mono w-[80px] shrink-0 text-right text-[13.5px] font-medium"
        style={{ color: estTsSeul ? "var(--ts)" : "var(--navy)" }}
      >
        {euro(v.mediane)}
      </span>
      <span className="hidden sm:block">
        <ReglettePrix stats={ref} indexe={indexe} ts={estTsSeul} />
      </span>
      <Infobulle
        contenu={
          <>
            {v.quartiles ? (
              <>
                <LigneInfo libelle="Prix bas" valeur={euro(v.quartiles.p25)} accent />
                <LigneInfo libelle="Prix haut" valeur={euro(v.quartiles.p75)} accent />
                <span className="mb-1 text-[11.5px] text-faint">
                  La moitié des devis se situe entre ces deux prix.
                </span>
              </>
            ) : (
              <span className="mb-1 text-[11.5px] text-faint">
                Moins de 4 lignes : pas encore de fourchette.
              </span>
            )}
            <LigneInfo libelle="Moyenne" valeur={euro(v.moyenne)} />
            <LigneInfo libelle="Minimum" valeur={euro(v.min)} />
            <LigneInfo libelle="Maximum" valeur={euro(v.max)} />
            <LigneInfo
              libelle="Chantiers"
              valeur={
                ref.premiereOccurrence && ref.derniereOccurrence
                  ? `${ref.nChantiers} · ${ref.premiereOccurrence.slice(0, 4)}–${ref.derniereOccurrence.slice(0, 4)}`
                  : String(ref.nChantiers)
              }
            />
            {estTsSeul && (
              <span className="mt-1 text-[11.5px]" style={{ color: "var(--ts)" }}>
                Uniquement des travaux supplémentaires.
              </span>
            )}
          </>
        }
      >
        <IconeInfo />
      </Infobulle>
      {ts && vt && !estTsSeul && (
        <Infobulle
          largeur={250}
          contenu={
            <>
              <LigneInfo libelle="Travaux supplémentaires" valeur={euro(vt.mediane)} accent />
              <LigneInfo libelle="Lignes TS" valeur={`n=${ts.n}`} />
              {deltaTs !== null && (
                <LigneInfo
                  libelle="Par rapport aux normaux"
                  valeur={`${deltaTs > 0 ? "+" : ""}${Math.round(deltaTs)} %`}
                />
              )}
              <span className="mt-1 text-[11.5px] text-faint">
                Chiffré à chaud, en petite quantité : plus cher, compté à part.
              </span>
            </>
          }
        >
          <span className="badge b-amber !px-1.5 !py-0 !text-[10.5px]">TS</span>
        </Infobulle>
      )}
    </div>
  );
}
