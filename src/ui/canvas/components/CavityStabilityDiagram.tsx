/**
 * CavityStabilityDiagram: the classic g1/g2 resonator stability diagram.
 *
 * A two-mirror cavity (length L, mirror radii R1/R2) is stable iff
 * 0 <= g1*g2 <= 1, where g1 = 1 - L/R1 and g2 = 1 - L/R2 (see optics-math
 * skill, "Optical Resonator Equations"). Plotted in the (g1, g2) plane, the
 * stable region is the pair of lobes bounded by the axes and the two
 * branches of the hyperbola g1*g2 = 1 - one in the first quadrant, one in
 * the third - since g1*g2 < 0 (opposite-sign g's) is always unstable.
 */

const SIZE = 200;
const MARGIN = 24;
const PLOT = SIZE - MARGIN * 2;
const G_RANGE = 2; // visible domain: g1, g2 in [-G_RANGE, G_RANGE]
const G_MIN_MAG = 1 / G_RANGE;

function toX(g: number): number {
  return MARGIN + ((g + G_RANGE) / (2 * G_RANGE)) * PLOT;
}

function toY(g: number): number {
  // g2 increases upward; SVG y increases downward.
  return MARGIN + ((G_RANGE - g) / (2 * G_RANGE)) * PLOT;
}

/** One branch of g1*g2=1, from |g|=G_MIN_MAG out to |g|=G_RANGE, signed by direction. */
function hyperbolaBranch(direction: 1 | -1, steps = 32): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mag = G_MIN_MAG + t * (G_RANGE - G_MIN_MAG);
    const g1 = direction * mag;
    points.push([g1, 1 / g1]);
  }
  return points;
}

/** The stable lobe in one quadrant (direction=1 for Q1, -1 for Q3), as a closed polygon in g-space. */
function stableLobe(direction: 1 | -1): Array<[number, number]> {
  const branch = hyperbolaBranch(direction);
  const curveInward = [...branch].reverse(); // far corner -> near corner, along the curve
  return [
    [0, 0],
    [G_RANGE * direction, 0],
    ...curveInward,
    [0, G_RANGE * direction],
    [0, 0],
  ];
}

function toPath(points: Array<[number, number]>): string {
  return points.map(([g1, g2], i) => `${i === 0 ? 'M' : 'L'} ${toX(g1).toFixed(2)} ${toY(g2).toFixed(2)}`).join(' ');
}

function toPolylinePoints(points: Array<[number, number]>): string {
  return points.map(([g1, g2]) => `${toX(g1).toFixed(2)},${toY(g2).toFixed(2)}`).join(' ');
}

const TICKS = [-2, -1, 1, 2];

// A design right at the edge of the stability region (g1*g2 near 0 or 1) is
// technically stable but has essentially no alignment margin - a tiny change
// in length or curvature tips it over. Flag that "critically stable" band
// separately from comfortably-stable designs.
const CRITICAL_MARGIN = 0.01;

type StabilityStatus = 'stable' | 'critical' | 'unstable';

function classifyStability(product: number): StabilityStatus {
  if (product < 0 || product > 1) {
    return 'unstable';
  }
  if (product <= CRITICAL_MARGIN || product >= 1 - CRITICAL_MARGIN) {
    return 'critical';
  }
  return 'stable';
}

const STATUS_LABEL: Record<StabilityStatus, string> = {
  stable: 'stable',
  critical: 'critically stable',
  unstable: 'unstable',
};

interface CavityStabilityDiagramProps {
  lengthMm: number;
  r1Mm: number;
  r2Mm: number;
}

export function CavityStabilityDiagram({ lengthMm, r1Mm, r2Mm }: CavityStabilityDiagramProps) {
  const g1 = 1 - lengthMm / r1Mm;
  const g2 = 1 - lengthMm / r2Mm;
  const hasPoint = Number.isFinite(g1) && Number.isFinite(g2);
  const status = hasPoint ? classifyStability(g1 * g2) : null;

  const clampedG1 = hasPoint ? Math.max(-G_RANGE, Math.min(G_RANGE, g1)) : 0;
  const clampedG2 = hasPoint ? Math.max(-G_RANGE, Math.min(G_RANGE, g2)) : 0;

  return (
    <div className="cavity-stability">
      <div className="cavity-stability-equation">Stability condition: 0 ≤ g₁g₂ ≤ 1</div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="cavity-stability-svg" role="img" aria-label="Cavity stability diagram">
        <path className="cavity-stability-lobe" d={toPath(stableLobe(1))} />
        <path className="cavity-stability-lobe" d={toPath(stableLobe(-1))} />

        <line className="cavity-stability-axis" x1={toX(-G_RANGE)} y1={toY(0)} x2={toX(G_RANGE)} y2={toY(0)} />
        <line className="cavity-stability-axis" x1={toX(0)} y1={toY(-G_RANGE)} x2={toX(0)} y2={toY(G_RANGE)} />

        {TICKS.map((t) => (
          <g key={`tick-x-${t}`}>
            <line className="cavity-stability-tick" x1={toX(t)} y1={toY(0) - 3} x2={toX(t)} y2={toY(0) + 3} />
            <text className="cavity-stability-tick-label" x={toX(t)} y={toY(0) + 13} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        {TICKS.map((t) => (
          <g key={`tick-y-${t}`}>
            <line className="cavity-stability-tick" x1={toX(0) - 3} y1={toY(t)} x2={toX(0) + 3} y2={toY(t)} />
            <text className="cavity-stability-tick-label" x={toX(0) - 6} y={toY(t) + 3} textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        <polyline className="cavity-stability-curve" points={toPolylinePoints(hyperbolaBranch(1))} />
        <polyline className="cavity-stability-curve" points={toPolylinePoints(hyperbolaBranch(-1))} />

        <text className="cavity-stability-axis-label" x={toX(G_RANGE) - 2} y={toY(0) - 8} textAnchor="end">
          g₁
        </text>
        <text className="cavity-stability-axis-label" x={toX(0) + 8} y={toY(G_RANGE) + 10} textAnchor="start">
          g₂
        </text>

        {hasPoint && status && (
          <circle
            className={`cavity-stability-point ${status}`}
            cx={toX(clampedG1)}
            cy={toY(clampedG2)}
            r={4.5}
          />
        )}
      </svg>
      <div className={status ? `cavity-stability-caption ${status}` : 'cavity-stability-caption'}>
        {hasPoint && status
          ? `g₁ = ${g1.toFixed(3)}, g₂ = ${g2.toFixed(3)} — ${STATUS_LABEL[status]}`
          : 'g₁/g₂ undefined for this geometry'}
      </div>
    </div>
  );
}
