import { useMemo } from 'react';
import type { GovernanceHealthEntry } from '../../shared/governance-health-history.ts';

interface StructuralHealthTrendProps {
  snapshots: GovernanceHealthEntry[];
}

interface DataPoint {
  date: string;
  value: number;
}

interface MetricDef {
  key: string;
  label: string;
  extract: (s: GovernanceHealthEntry) => number | null;
  /**
   * "higher-is-better" or "lower-is-better" controls whether an upward
   * trend indicator is rendered green (improving) or red (worsening).
   */
  direction: 'higher-is-better' | 'lower-is-better';
  formatValue: (v: number) => string;
  strokeClass: string;
  fillClass: string;
  dotClass: string;
}

const METRICS: MetricDef[] = [
  {
    key: 'cycleTimeP95',
    label: 'PR Cycle Time (p95)',
    extract: (s) =>
      s.prCycleTime.p95 !== null ? s.prCycleTime.p95 / 60 : null,
    direction: 'lower-is-better',
    formatValue: (v) => `${v.toFixed(0)}h`,
    strokeClass: 'text-sky-500 dark:text-sky-400',
    fillClass: 'text-sky-200/40 dark:text-sky-800/30',
    dotClass: 'text-sky-600 dark:text-sky-300',
  },
  {
    key: 'giniIndex',
    label: 'Role Diversity (Gini)',
    extract: (s) => s.roleDiversity.giniIndex,
    direction: 'lower-is-better',
    formatValue: (v) => v.toFixed(2),
    strokeClass: 'text-violet-500 dark:text-violet-400',
    fillClass: 'text-violet-200/40 dark:text-violet-800/30',
    dotClass: 'text-violet-600 dark:text-violet-300',
  },
  {
    key: 'contestedRate',
    label: 'Contested Decision Rate',
    extract: (s) =>
      s.contestedDecisionRate.totalVoted > 0
        ? s.contestedDecisionRate.rate * 100
        : null,
    direction: 'higher-is-better',
    formatValue: (v) => `${v.toFixed(0)}%`,
    strokeClass: 'text-amber-500 dark:text-amber-400',
    fillClass: 'text-amber-200/40 dark:text-amber-800/30',
    dotClass: 'text-amber-600 dark:text-amber-300',
  },
  {
    key: 'crossRoleRate',
    label: 'Cross-Role Review Rate',
    extract: (s) =>
      s.crossRoleReviewRate.totalReviews > 0
        ? s.crossRoleReviewRate.rate * 100
        : null,
    direction: 'higher-is-better',
    formatValue: (v) => `${v.toFixed(0)}%`,
    strokeClass: 'text-emerald-500 dark:text-emerald-400',
    fillClass: 'text-emerald-200/40 dark:text-emerald-800/30',
    dotClass: 'text-emerald-600 dark:text-emerald-300',
  },
];

/**
 * Renders trend sparklines for the four CHAOSS-aligned governance health
 * metrics stored in governance-health-history.json (written by generate-data.ts
 * after PR #612 merges).
 *
 * Designed to complement GovernanceTrend (which shows the high-level health
 * score from governance-history.json) — this panel shows the underlying
 * structural metrics over time.
 *
 * Returns null when fewer than 2 snapshots are available.
 */
export function StructuralHealthTrend({
  snapshots,
}: StructuralHealthTrendProps): React.ReactElement | null {
  const metricData = useMemo(
    () =>
      METRICS.map((metric) => ({
        metric,
        points: toDataPoints(snapshots, metric.extract),
      })),
    [snapshots]
  );

  // Need at least 2 points to show a meaningful trend
  const hasData = metricData.some((d) => d.points.length >= 2);
  if (!hasData) return null;

  return (
    <div
      className="pt-3 mt-3 border-t border-amber-200/50 dark:border-neutral-600/50"
      aria-label="CHAOSS governance health metric trends"
    >
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">
        Structural Health Trends
      </p>
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        role="group"
        aria-label="CHAOSS-aligned metric sparklines"
      >
        {metricData.map(({ metric, points }) => (
          <MetricCard key={metric.key} metric={metric} points={points} />
        ))}
      </div>
      <p className="text-xs text-amber-500 dark:text-amber-500 mt-2">
        {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} ·
        CHAOSS-aligned metrics
      </p>
    </div>
  );
}

function MetricCard({
  metric,
  points,
}: {
  metric: MetricDef;
  points: DataPoint[];
}): React.ReactElement {
  const current = points.length > 0 ? points[points.length - 1].value : null;
  const trendDir =
    points.length >= 2 ? getTrendDirection(points, metric.direction) : null;

  const trendArrow: Record<'up' | 'down' | 'flat', string> = {
    up: '\u2191',
    down: '\u2193',
    flat: '\u2192',
  };
  const trendColor: Record<'improving' | 'stable' | 'worsening', string> = {
    improving: 'text-green-600 dark:text-green-400',
    stable: 'text-blue-600 dark:text-blue-400',
    worsening: 'text-red-600 dark:text-red-400',
  };

  return (
    <div
      className="space-y-1"
      aria-label={`${metric.label} structural health trend`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {metric.label}
        </span>
        <span className="flex items-center gap-1">
          {current !== null && (
            <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
              {metric.formatValue(current)}
            </span>
          )}
          {trendDir && (
            <span
              className={`text-xs ${trendColor[trendDir.sentiment]}`}
              aria-label={`${metric.label} trend: ${trendDir.sentiment}`}
            >
              {trendArrow[trendDir.arrow]}
            </span>
          )}
        </span>
      </div>
      {points.length >= 2 ? (
        <Sparkline
          data={points}
          ariaLabel={`${metric.label} trend over ${points.length} data points`}
          strokeClass={metric.strokeClass}
          fillClass={metric.fillClass}
          dotClass={metric.dotClass}
        />
      ) : (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 italic">
          Insufficient data
        </p>
      )}
    </div>
  );
}

function getTrendDirection(
  points: DataPoint[],
  direction: MetricDef['direction']
): {
  arrow: 'up' | 'down' | 'flat';
  sentiment: 'improving' | 'stable' | 'worsening';
} {
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const relativeChange = first !== 0 ? (last - first) / Math.abs(first) : 0;

  // Threshold: 5% relative change to avoid noise
  const THRESHOLD = 0.05;

  if (relativeChange > THRESHOLD) {
    return {
      arrow: 'up',
      sentiment: direction === 'higher-is-better' ? 'improving' : 'worsening',
    };
  }
  if (relativeChange < -THRESHOLD) {
    return {
      arrow: 'down',
      sentiment: direction === 'lower-is-better' ? 'improving' : 'worsening',
    };
  }
  return { arrow: 'flat', sentiment: 'stable' };
}

function toDataPoints(
  snapshots: GovernanceHealthEntry[],
  extract: (s: GovernanceHealthEntry) => number | null
): DataPoint[] {
  const points: DataPoint[] = [];
  for (const s of snapshots) {
    const value = extract(s);
    if (value !== null) {
      points.push({ date: s.timestamp.slice(0, 10), value });
    }
  }
  return points;
}

/** Compact SVG sparkline — no charting library needed. */
function Sparkline({
  data,
  ariaLabel,
  strokeClass,
  fillClass,
  dotClass,
}: {
  data: DataPoint[];
  ariaLabel: string;
  strokeClass: string;
  fillClass: string;
  dotClass: string;
}): React.ReactElement {
  const width = 120;
  const height = 24;
  const padding = 2;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x =
      padding + (i / Math.max(values.length - 1, 1)) * (width - 2 * padding);
    const y = height - padding - ((v - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const fillD = `${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;
  const lastX =
    padding +
    ((values.length - 1) / Math.max(values.length - 1, 1)) *
      (width - 2 * padding);
  const lastY =
    height -
    padding -
    ((values[values.length - 1] - min) / range) * (height - 2 * padding);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="w-full max-w-[120px]"
    >
      <path d={fillD} fill="currentColor" className={fillClass} />
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClass}
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={1.5}
        fill="currentColor"
        className={dotClass}
      />
    </svg>
  );
}
