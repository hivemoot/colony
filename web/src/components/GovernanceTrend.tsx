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
}

interface DailyPoint {
  date: string;
  score: number;
}

interface SubMetricDef {
  key: string;
  label: string;
  extract: (s: GovernanceSnapshot) => number;
  maxScore: number;
  strokeClass: string;
  fillClass: string;
  dotClass: string;
}

const SUB_METRICS: SubMetricDef[] = [
  {
    key: 'participation',
    label: 'Participation',
    extract: (s) => s.participation,
    maxScore: 25,
    strokeClass: 'text-emerald-500 dark:text-emerald-400',
    fillClass: 'text-emerald-200/50 dark:text-emerald-800/30',
    dotClass: 'text-emerald-600 dark:text-emerald-300',
  },
  {
    key: 'pipelineFlow',
    label: 'Pipeline Flow',
    extract: (s) => s.pipelineFlow,
    maxScore: 25,
    strokeClass: 'text-sky-500 dark:text-sky-400',
    fillClass: 'text-sky-200/50 dark:text-sky-800/30',
    dotClass: 'text-sky-600 dark:text-sky-300',
  },
  {
    key: 'followThrough',
    label: 'Follow-Through',
    extract: (s) => s.followThrough,
    maxScore: 25,
    strokeClass: 'text-violet-500 dark:text-violet-400',
    fillClass: 'text-violet-200/50 dark:text-violet-800/30',
    dotClass: 'text-violet-600 dark:text-violet-300',
  },
  {
    key: 'consensusQuality',
    label: 'Consensus',
    extract: (s) => s.consensusQuality,
    maxScore: 25,
    strokeClass: 'text-rose-500 dark:text-rose-400',
    fillClass: 'text-rose-200/50 dark:text-rose-800/30',
    dotClass: 'text-rose-600 dark:text-rose-300',
  },
];

/**
 * Displays a sparkline of governance health score over time,
 * a trend indicator (improving/stable/declining), and a 7-day delta.
 * Below the overall trend, shows a 2x2 grid of sub-metric sparklines
 * for participation, pipeline flow, follow-through, and consensus quality.
 *
 * Designed to complement the GovernanceHealth score badge. Shows
 * trajectory rather than just a snapshot.
 */
export function GovernanceTrend({
  history,
}: GovernanceTrendProps): React.ReactElement | null {
  const dailyAverages = useMemo(() => computeDailyAverages(history), [history]);

  const trend = useMemo(() => computeTrend(dailyAverages), [dailyAverages]);

  const subMetricData = useMemo(
    () =>
      SUB_METRICS.map((metric) => ({
        metric,
        daily: computeDailyAveragesForMetric(history, metric.extract),
      })),
    [history]
  );

  // Need at least 2 data points to show a trend
  if (dailyAverages.length < 2) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <TrendIndicator trend={trend} />
        {trend.delta !== null && <TrendDelta delta={trend.delta} />}
      </div>
      <Sparkline
        data={dailyAverages}
        ariaLabel={`Health score trend: ${dailyAverages[0].score} to ${dailyAverages[dailyAverages.length - 1].score} over ${dailyAverages.length} days`}
        strokeClass="text-amber-500 dark:text-amber-400"
        fillClass="text-amber-200/50 dark:text-amber-800/30"
        dotClass="text-amber-600 dark:text-amber-300"
      />
      <p className="text-xs text-amber-600 dark:text-amber-400">
        {dailyAverages.length} day{dailyAverages.length !== 1 ? 's' : ''} of
        governance history
      </p>
      <SubMetricGrid data={subMetricData} />
    </div>
  );
}

function SubMetricGrid({
  data,
}: {
  data: Array<{
    metric: SubMetricDef;
    daily: DailyPoint[];
  }>;
}): React.ReactElement | null {
  // Only render if we have enough data for meaningful sub-trends
  const hasData = data.some((d) => d.daily.length >= 2);
  if (!hasData) return null;

  return (
    <div
      className="grid grid-cols-1 gap-3 pt-2 border-t border-amber-200/50 dark:border-neutral-600/50 sm:grid-cols-2"
      role="group"
      aria-label="Governance sub-metric trends"
    >
      {data.map(({ metric, daily }) => (
        <SubMetricCard key={metric.key} metric={metric} daily={daily} />
      ))}
    </div>
  );
}

function SubMetricCard({
  metric,
  daily,
}: {
  metric: SubMetricDef;
  daily: DailyPoint[];
}): React.ReactElement {
  const trend = useMemo(() => computeTrend(daily), [daily]);
  const currentScore = daily.length > 0 ? daily[daily.length - 1].score : 0;

  const arrows: Record<TrendDirection, string> = {
    improving: '\u2191',
    stable: '\u2192',
    declining: '\u2193',
  };

  const directionColors: Record<TrendDirection, string> = {
    improving: 'text-green-600 dark:text-green-400',
    stable: 'text-blue-600 dark:text-blue-400',
    declining: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="space-y-1" aria-label={`${metric.label} trend`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {metric.label}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
            {currentScore}/{metric.maxScore}
          </span>
          {daily.length >= 2 && (
            <span
              className={`text-xs ${directionColors[trend.direction]}`}
              aria-label={formatTrendAriaLabel(metric.label, trend)}
            >
              {arrows[trend.direction]}
            </span>
          )}
        </span>
      </div>
      {daily.length >= 2 ? (
        <Sparkline
          data={daily}
          ariaLabel={`${metric.label} trend: ${daily[0].score} to ${daily[daily.length - 1].score} over ${daily.length} days`}
          strokeClass={metric.strokeClass}
          fillClass={metric.fillClass}
          dotClass={metric.dotClass}
          compact
        />
      ) : (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 italic">
          Insufficient data
        </p>
      )}
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
      aria-label={formatTrendAriaLabel('Governance', trend)}
    >
      {arrows[trend.direction]} {trend.label}
    </span>
  );
}

function formatTrendAriaLabel(context: string, trend: TrendInfo): string {
  if (trend.delta === null) {
    return `${context} trend: stable, insufficient data`;
  }

  const unit =
    context === 'Governance' ? 'points vs prior 7 days' : 'point change';
  const signedDelta = `${trend.delta >= 0 ? '+' : ''}${trend.delta}`;
  return `${context} trend: ${trend.direction}, ${signedDelta} ${unit}`;
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
  ariaLabel,
  strokeClass,
  fillClass,
  dotClass,
  compact = false,
}: {
  data: DailyPoint[];
  ariaLabel: string;
  strokeClass: string;
  fillClass: string;
  dotClass: string;
  compact?: boolean;
}): React.ReactElement {
  const width = compact ? 120 : 200;
  const height = compact ? 24 : 40;
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

  const dotR = compact ? 1.5 : 2.5;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className={compact ? 'w-full max-w-[120px]' : 'w-full max-w-[200px]'}
    >
      <path d={fillD} fill="currentColor" className={fillClass} />
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth={compact ? '1' : '1.5'}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClass}
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
        r={dotR}
        fill="currentColor"
        className={dotClass}
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
function computeDailyAverages(history: GovernanceSnapshot[]): DailyPoint[] {
  return computeDailyAveragesForMetric(history, (s) => s.healthScore);
}

/**
 * Downsample snapshots to daily averages for any numeric metric.
 */
function computeDailyAveragesForMetric(
  history: GovernanceSnapshot[],
  extract: (s: GovernanceSnapshot) => number
): DailyPoint[] {
  if (history.length === 0) return [];

  const byDay = new Map<string, number[]>();

  for (const s of history) {
    const date = s.timestamp.slice(0, 10); // YYYY-MM-DD
    const existing = byDay.get(date);
    const value = extract(s);
    if (existing) {
      existing.push(value);
    } else {
      byDay.set(date, [value]);
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
function computeTrend(dailyAverages: DailyPoint[]): TrendInfo {
  if (dailyAverages.length < 2) {
    return {
      direction: 'stable',
      delta: null,
      label: 'Stable',
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
  };
}
