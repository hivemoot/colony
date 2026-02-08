import { useMemo } from 'react';
import type { ActivityData } from '../types/activity';
import {
  computeGovernanceHealth,
  type GovernanceHealthScore,
  type HealthBucket,
  type SubMetric,
} from '../utils/governance-health';

interface GovernanceHealthProps {
  data: ActivityData;
}

const BUCKET_STYLES: Record<
  HealthBucket,
  { bg: string; text: string; ring: string }
> = {
  Thriving: {
    bg: 'bg-green-100 dark:bg-green-900/40',
    text: 'text-green-800 dark:text-green-200',
    ring: 'ring-green-300 dark:ring-green-700',
  },
  Healthy: {
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    text: 'text-blue-800 dark:text-blue-200',
    ring: 'ring-blue-300 dark:ring-blue-700',
  },
  'Needs Attention': {
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-800 dark:text-amber-200',
    ring: 'ring-amber-300 dark:ring-amber-700',
  },
  Critical: {
    bg: 'bg-red-100 dark:bg-red-900/40',
    text: 'text-red-800 dark:text-red-200',
    ring: 'ring-red-300 dark:ring-red-700',
  },
};

export function GovernanceHealth({
  data,
}: GovernanceHealthProps): React.ReactElement {
  const health = useMemo(() => computeGovernanceHealth(data), [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <ScoreBadge health={health} />
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Based on{' '}
            <span className="font-medium">
              {health.dataWindowDays} day
              {health.dataWindowDays !== 1 ? 's' : ''}
            </span>{' '}
            of governance data
          </p>
        </div>
      </div>
      <SubMetricBreakdown subMetrics={health.subMetrics} />
    </div>
  );
}

function ScoreBadge({
  health,
}: {
  health: GovernanceHealthScore;
}): React.ReactElement {
  const styles = BUCKET_STYLES[health.bucket];

  return (
    <div
      className={`flex flex-col items-center justify-center w-28 h-28 rounded-full ring-4 ${styles.bg} ${styles.ring}`}
      role="img"
      aria-label={`Governance health score: ${health.score} out of 100, ${health.bucket}`}
    >
      <span className={`text-3xl font-bold ${styles.text}`}>
        {health.score}
      </span>
      <span className={`text-xs font-medium ${styles.text}`}>
        {health.bucket}
      </span>
    </div>
  );
}

function SubMetricBreakdown({
  subMetrics,
}: {
  subMetrics: GovernanceHealthScore['subMetrics'];
}): React.ReactElement {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {subMetrics.map((metric) => (
        <SubMetricCard key={metric.key} metric={metric} />
      ))}
    </div>
  );
}

function SubMetricCard({ metric }: { metric: SubMetric }): React.ReactElement {
  const pct = (metric.score / 25) * 100;

  return (
    <div className="bg-white/30 dark:bg-neutral-800/30 rounded-lg p-3 border border-amber-100 dark:border-neutral-700">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
          {metric.label}
        </span>
        <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
          {metric.score}/25
        </span>
      </div>
      <div
        className="h-2 bg-amber-50 dark:bg-neutral-800 rounded-full overflow-hidden border border-amber-100 dark:border-neutral-700"
        role="img"
        aria-label={`${metric.label}: ${metric.score} of 25`}
      >
        <div
          className={`h-full rounded-full motion-safe:transition-all ${getBarColor(metric.score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
        {metric.reason}
      </p>
    </div>
  );
}

function getBarColor(score: number): string {
  if (score >= 20) return 'bg-green-400 dark:bg-green-500';
  if (score >= 13) return 'bg-blue-400 dark:bg-blue-500';
  if (score >= 7) return 'bg-amber-400 dark:bg-amber-500';
  return 'bg-red-400 dark:bg-red-500';
}
