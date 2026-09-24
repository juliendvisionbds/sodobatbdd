"use client";

// Graphiques de la fiche ouvrage (Recharts).
// Les points TS se distinguent par la FORME du marqueur (triangle),
// jamais par la couleur seule.

import {
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { euro, date as fmtDate, type PointQuantite } from "@/lib/types";

interface PointGraphe {
  x: number;
  y: number;
  estTs: boolean;
  libelle: string;
}

function Triangle(props: { cx?: number; cy?: number }) {
  const { cx = 0, cy = 0 } = props;
  return (
    <path
      d={`M ${cx} ${cy - 4.5} L ${cx + 4.5} ${cy + 3.5} L ${cx - 4.5} ${cy + 3.5} Z`}
      fill="var(--ts)"
      stroke="var(--bg)"
      strokeWidth={0.5}
    />
  );
}

function Rond(props: { cx?: number; cy?: number }) {
  const { cx = 0, cy = 0 } = props;
  return (
    <circle cx={cx} cy={cy} r={3.5} fill="var(--navy)" fillOpacity={0.85} />
  );
}

/** Droite de tendance (moindres carrés) — présentation, pas une
 *  statistique stockée. */
function tendance(points: PointGraphe[]): Array<{ x: number; tendance: number }> {
  if (points.length < 3) return [];
  const n = points.length;
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return [];
  const a = (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  const xs = points.map((p) => p.x);
  const x1 = Math.min(...xs);
  const x2 = Math.max(...xs);
  return [
    { x: x1, tendance: a * x1 + b },
    { x: x2, tendance: a * x2 + b },
  ];
}

function InfoBulle({
  active,
  payload,
  formatX,
}: {
  active?: boolean;
  payload?: Array<{ payload: PointGraphe & { tendance?: number } }>;
  formatX: (x: number) => string;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p || p.y === undefined || !("estTs" in p)) return null;
  return (
    <div className="rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-[12px]">
      <div className="mono font-medium text-navy">{euro(p.y)}</div>
      <div className="text-sub">
        {formatX(p.x)} {p.estTs ? "· TS" : ""}
      </div>
      {p.libelle && <div className="text-sub">{p.libelle}</div>}
    </div>
  );
}

function Nuage({
  points,
  formatX,
  domaineX,
}: {
  points: PointGraphe[];
  formatX: (x: number) => string;
  domaineX?: [number, number];
}) {
  const normaux = points.filter((p) => !p.estTs);
  const ts = points.filter((p) => p.estTs);
  const ligneTendance = tendance(points);

  return (
    <ResponsiveContainer width="100%" height={170}>
      <ComposedChart margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <XAxis
          dataKey="x"
          type="number"
          domain={domaineX ?? ["dataMin", "dataMax"]}
          tickFormatter={formatX}
          tick={{ fontSize: 10, fill: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}
          stroke="var(--border)"
          tickLine={false}
        />
        <YAxis
          dataKey="y"
          type="number"
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => String(Math.round(v))}
          tick={{ fontSize: 10, fill: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}
          stroke="var(--border)"
          tickLine={false}
          width={42}
        />
        <Tooltip
          content={<InfoBulle formatX={formatX} />}
          cursor={{ stroke: "var(--hairline)", strokeDasharray: "2 2" }}
        />
        {ligneTendance.length > 0 && (
          <Line
            data={ligneTendance}
            dataKey="tendance"
            stroke="var(--navy-soft)"
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
            legendType="none"
          />
        )}
        <Scatter data={normaux} shape={<Rond />} isAnimationActive={false} />
        <Scatter data={ts} shape={<Triangle />} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function GrapheEvolution({
  points,
  indexe,
}: {
  points: PointQuantite[];
  indexe: boolean;
}) {
  const donnees: PointGraphe[] = points.map((p) => ({
    x: new Date(p.date).getTime(),
    y: indexe ? p.puIndexe : p.pu,
    estTs: p.estTs,
    libelle: fmtDate(p.date),
  }));
  return (
    <Nuage
      points={donnees}
      formatX={(x) =>
        new Date(x).toLocaleDateString("fr-FR", {
          month: "2-digit",
          year: "2-digit",
        })
      }
    />
  );
}

export function GrapheQuantite({
  points,
  indexe,
  unite,
}: {
  points: PointQuantite[];
  indexe: boolean;
  unite: string;
}) {
  const donnees: PointGraphe[] = points.map((p) => ({
    x: p.quantite,
    y: indexe ? p.puIndexe : p.pu,
    estTs: p.estTs,
    libelle: `${p.quantite} ${unite}`,
  }));
  return <Nuage points={donnees} formatX={(x) => String(Math.round(x))} />;
}
