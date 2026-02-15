import { useMemo } from 'react';
import type { ActivityData } from '../types/activity';
import {
  computeVelocityMetrics,
  type VelocityMetrics as Metrics,
} from '../utils/velocity';

interface VelocityMetricsProps {
  data: ActivityData;
}

type TrendDirection = 'up' | 'down' | 'flat';

interface MetricCardDef {
  key: string;
  label: string;
  value: (m: Metrics) => string;
  detail: (m: Metrics) => string;
  trend: (m: Metrics) => TrendDirection;
  ariaValue: (m: Metrics) => string;
}

const METRIC_CARDS: MetricCardDef[] = [
  {
    key: 'pr-cycle',
    label: 'PR Cycle Time',
    value: (m) => formatHours(m.medianPrCycleHours),
    detail: () => 'Median creation-to-merge',
    trend: () => 'flat',
    ariaValue: (m) =>
      m.medianPrCycleHours !== null
        ? `Median PR cycle time: ${formatHours(m.medianPrCycleHours)}`
        : 'No merged PRs',
  },
  {
    key: 'proposal-ship',
    label: 'Proposal to Ship',
    value: (m) => formatHours(m.medianProposalToShipHours),
    detail: () => 'Median proposal-to-implemented',
    trend: () => 'flat',
    ariaValue: (m) =>
      m.medianProposalToShipHours !== null
        ? `Median proposal to ship time: ${formatHours(m.medianProposalToShipHours)}`
        : 'No implemented proposals',
  },
  {
    key: 'merge-queue',
    label: 'Merge Queue',
    value: (m) => `${m.openPrCount}`,
    detail: () => 'Open PRs',
    trend: (m) =>
      m.openPrCount > 10 ? 'down' : m.openPrCount < 5 ? 'up' : 'flat',
    ariaValue: (m) => `${m.openPrCount} open pull requests in merge queue`,
  },
  {
    key: 'weekly-merged',
    label: 'Weekly Throughput',
    value: (m) => `${m.weeklyMergedCount}`,
    detail: (m): string => {
      if (m.previousWeekMergedCount === 0) return 'PRs merged this week';
      const delta = m.weeklyMergedCount - m.previousWeekMergedCount;
      const sign = delta >= 0 ? '+' : '';
      return `${sign}${delta} vs last week`;
    },
    trend: (m): TrendDirection => {
      if (m.previousWeekMergedCount === 0) return 'flat';
      return m.weeklyMergedCount > m.previousWeekMergedCount
        ? 'up'
        : m.weeklyMergedCount < m.previousWeekMergedCount
          ? 'down'
          : 'flat';
    },
    ariaValue: (m) =>
      `${m.weeklyMergedCount} PRs merged this week, ${m.previousWeekMergedCount} last week`,
  },
  {
    key: 'governance-overhead',
    label: 'Governance Overhead',
    value: (m) =>
      m.governanceOverheadRatio !== null
        ? `${Math.round(m.governanceOverheadRatio * 100)}%`
        : '--',
    detail: () => 'Governance vs total time',
    trend: (m): TrendDirection => {
      if (m.governanceOverheadRatio === null) return 'flat';
      return m.governanceOverheadRatio > 0.7
        ? 'down'
        : m.governanceOverheadRatio < 0.4
          ? 'up'
          : 'flat';
    },
    ariaValue: (m) =>
      m.governanceOverheadRatio !== null
        ? `Governance overhead: ${Math.round(m.governanceOverheadRatio * 100)}% of total proposal lifecycle`
        : 'Governance overhead: insufficient data',
  },
];

export function VelocityMetrics({
  data,
}: VelocityMetricsProps): React.ReactElement {
  const metrics = useMemo(() => computeVelocityMetrics(data), [data]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-amber-700 dark:text-amber-300">
        How fast does code move from idea to deployment?
      </p>
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        role="group"
        aria-label="Development velocity metrics"
      >
        {METRIC_CARDS.map((card) => (
          <MetricCard key={card.key} def={card} metrics={metrics} />
        ))}
        <SparklineCard metrics={metrics} />
      </div>
    </div>
  );
}

function MetricCard({
  def,
  metrics,
}: {
  def: MetricCardDef;
  metrics: Metrics;
}): React.ReactElement {
  const trend = def.trend(metrics);
  const value = def.value(metrics);
  const detail = def.detail(metrics);
  const ariaValue = def.ariaValue(metrics);

  return (
    <div
      className="rounded-lg border border-amber-200/70 dark:border-neutral-600/70 bg-white/60 dark:bg-neutral-800/60 p-3 space-y-1"
      aria-label={ariaValue}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {def.label}
        </span>
        <TrendArrow direction={trend} label={def.label} />
      </div>
      <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
        {value}
      </div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        {detail}
      </div>
    </div>
  );
}

function SparklineCard({ metrics }: { metrics: Metrics }): React.ReactElement {
  const series = metrics.weeklyMergeSeries;
  const max = Math.max(...series, 1);
  const width = 160;
  const height = 32;
  const padding = 2;
  const barGap = 2;
  const barWidth =
    (width - 2 * padding - (series.length - 1) * barGap) / series.length;

  return (
    <div
      className="rounded-lg border border-amber-200/70 dark:border-neutral-600/70 bg-white/60 dark:bg-neutral-800/60 p-3 space-y-1"
      aria-label={`Weekly merge trend: ${series.join(', ')} PRs per week over last 8 weeks`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Merge Trend (8 weeks)
        </span>
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Weekly merge count sparkline"
        className="w-full max-w-[160px]"
      >
        {series.map((count, i) => {
          const scaled = (count / max) * (height - 2 * padding);
          const barHeight = count === 0 ? 0 : Math.max(scaled, 1);
          if (barHeight === 0) return null;
          const x = padding + i * (barWidth + barGap);
          const y = height - padding - barHeight;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={1}
              fill="currentColor"
              className={
                i === series.length - 1
                  ? 'text-amber-500 dark:text-amber-400'
                  : 'text-amber-300 dark:text-amber-600'
              }
            />
          );
        })}
      </svg>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        Oldest to newest
      </div>
    </div>
  );
}

function TrendArrow({
  direction,
  label,
}: {
  direction: TrendDirection;
  label: string;
}): React.ReactElement {
  const arrows: Record<TrendDirection, string> = {
    up: '\u2191',
    down: '\u2193',
    flat: '\u2192',
  };

  const colors: Record<TrendDirection, string> = {
    up: 'text-green-600 dark:text-green-400',
    down: 'text-red-600 dark:text-red-400',
    flat: 'text-blue-600 dark:text-blue-400',
  };

  const directionLabel: Record<TrendDirection, string> = {
    up: 'positive',
    down: 'needs attention',
    flat: 'stable',
  };

  return (
    <span
      className={`text-xs ${colors[direction]}`}
      aria-label={`${label} trend: ${directionLabel[direction]}`}
    >
      {arrows[direction]}
    </span>
  );
}

function formatHours(hours: number | null): string {
  if (hours === null) return '--';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}
