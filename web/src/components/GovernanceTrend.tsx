import { useMemo } from 'react';
import type { GovernanceSnapshot } from '../../shared/governance-snapshot.ts';

interface GovernanceTrendProps {
  history: GovernanceSnapshot[];
}

/**
 * Direction derived from comparing the current 7-day average to the
 * prior 7-day average. Uses rolling averages to filter out daily noise.
 */
type TrendDirection = 'improving' | 'stable' | 'declining';

interface TrendInfo {
  direction: TrendDirection;
  delta: number | null;
  label: string;
  ariaLabel: string;
}

/**
 * Displays a sparkline of governance health score over time,
 * a trend indicator (improving/stable/declining), and a 7-day delta.
 *
 * Designed to complement the GovernanceHealth score badge. Shows
 * trajectory rather than just a snapshot.
 */
export function GovernanceTrend({
  history,
}: GovernanceTrendProps): React.ReactElement | null {
  const dailyAverages = useMemo(() => computeDailyAverages(history), [history]);

  const trend = useMemo(() => computeTrend(dailyAverages), [dailyAverages]);

  // Need at least 2 data points to show a trend
  if (dailyAverages.length < 2) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <TrendIndicator trend={trend} />
        {trend.delta !== null && <TrendDelta delta={trend.delta} />}
      </div>
      <Sparkline data={dailyAverages} />
      <p className="text-xs text-amber-600 dark:text-amber-400">
        {dailyAverages.length} day{dailyAverages.length !== 1 ? 's' : ''} of
        governance history
      </p>
    </div>
  );
}

function TrendIndicator({ trend }: { trend: TrendInfo }): React.ReactElement {
  const styles: Record<TrendDirection, string> = {
    improving: 'text-green-600 dark:text-green-400',
    stable: 'text-blue-600 dark:text-blue-400',
    declining: 'text-red-600 dark:text-red-400',
  };

  const arrows: Record<TrendDirection, string> = {
    improving: '\u2191',
    stable: '\u2192',
    declining: '\u2193',
  };

  return (
    <span
      className={`text-sm font-medium ${styles[trend.direction]}`}
      aria-label={trend.ariaLabel}
    >
      {arrows[trend.direction]} {trend.label}
    </span>
  );
}

function TrendDelta({ delta }: { delta: number }): React.ReactElement {
  const sign = delta >= 0 ? '+' : '';
  const color =
    delta > 0
      ? 'text-green-600 dark:text-green-400'
      : delta < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-blue-600 dark:text-blue-400';

  return (
    <span className={`text-xs font-mono ${color}`}>
      ({sign}
      {delta} from 7d ago)
    </span>
  );
}

/** SVG sparkline — no charting library needed */
function Sparkline({
  data,
}: {
  data: Array<{ date: string; score: number }>;
}): React.ReactElement {
  const width = 200;
  const height = 40;
  const padding = 2;

  const scores = data.map((d) => d.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const points = scores.map((score, i) => {
    const x =
      padding + (i / Math.max(scores.length - 1, 1)) * (width - 2 * padding);
    const y =
      height - padding - ((score - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  // Fill area under the line
  const fillD = `${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Health score trend: ${scores[0]} to ${scores[scores.length - 1]} over ${data.length} days`}
      className="w-full max-w-[200px]"
    >
      <path
        d={fillD}
        fill="currentColor"
        className="text-amber-200/50 dark:text-amber-800/30"
      />
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-amber-500 dark:text-amber-400"
      />
      {/* Current value dot */}
      <circle
        cx={
          padding +
          ((scores.length - 1) / Math.max(scores.length - 1, 1)) *
            (width - 2 * padding)
        }
        cy={
          height -
          padding -
          ((scores[scores.length - 1] - min) / range) * (height - 2 * padding)
        }
        r="2.5"
        fill="currentColor"
        className="text-amber-600 dark:text-amber-300"
      />
    </svg>
  );
}

// --- Internal helpers ---

/**
 * Downsample snapshots to daily averages.
 * Polisher feedback: sparklines with 120 6h-interval points are noisy.
 * Daily averages produce 30 clean data points for 30 days.
 */
function computeDailyAverages(
  history: GovernanceSnapshot[]
): Array<{ date: string; score: number }> {
  if (history.length === 0) return [];

  const byDay = new Map<string, number[]>();

  for (const s of history) {
    const date = s.timestamp.slice(0, 10); // YYYY-MM-DD
    const existing = byDay.get(date);
    if (existing) {
      existing.push(s.healthScore);
    } else {
      byDay.set(date, [s.healthScore]);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }));
}

/**
 * Compare current 7-day rolling average to prior 7-day average.
 * This filters out daily noise and weekend lulls per Polisher feedback.
 */
function computeTrend(
  dailyAverages: Array<{ date: string; score: number }>
): TrendInfo {
  if (dailyAverages.length < 2) {
    return {
      direction: 'stable',
      delta: null,
      label: 'Stable',
      ariaLabel: 'Governance trend: stable, insufficient data',
    };
  }

  const scores = dailyAverages.map((d) => d.score);

  // Current period: last 7 days (or all if < 7)
  const currentSlice = scores.slice(-Math.min(7, scores.length));
  const currentAvg =
    currentSlice.reduce((a, b) => a + b, 0) / currentSlice.length;

  // Prior period: the 7 days before that
  const priorEnd = scores.length - currentSlice.length;
  if (priorEnd <= 0) {
    // Not enough data for a prior period — use first vs last
    const delta = scores[scores.length - 1] - scores[0];
    const direction =
      delta > 2 ? 'improving' : delta < -2 ? 'declining' : 'stable';
    return {
      direction,
      delta: Math.round(delta),
      label:
        direction === 'improving'
          ? 'Improving'
          : direction === 'declining'
            ? 'Declining'
            : 'Stable',
      ariaLabel: `Governance trend: ${direction}, ${Math.round(delta)} point change`,
    };
  }

  const priorSlice = scores.slice(Math.max(0, priorEnd - 7), priorEnd);
  const priorAvg = priorSlice.reduce((a, b) => a + b, 0) / priorSlice.length;

  const delta = Math.round(currentAvg - priorAvg);
  // Threshold of ±3 points filters out noise
  const direction: TrendDirection =
    delta > 3 ? 'improving' : delta < -3 ? 'declining' : 'stable';

  const label =
    direction === 'improving'
      ? 'Improving'
      : direction === 'declining'
        ? 'Declining'
        : 'Stable';

  return {
    direction,
    delta,
    label,
    ariaLabel: `Governance trend: ${direction}, ${delta >= 0 ? '+' : ''}${delta} points vs prior 7 days`,
  };
}
