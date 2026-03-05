import type {
  GovernanceHealthMetrics,
  PrCycleTimeMetric,
  RoleDiversityMetric,
  ContestedDecisionRateMetric,
  CrossAgentReviewRateMetric,
} from '../../shared/governance-health-metrics.ts';

interface StructuralHealthPanelProps {
  metrics: GovernanceHealthMetrics | null;
}

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  sampleSize: number;
  sampleLabel?: string;
  status: 'good' | 'neutral' | 'warn';
}

function statusClasses(status: MetricCardProps['status']): {
  card: string;
  badge: string;
  dot: string;
} {
  switch (status) {
    case 'good':
      return {
        card: 'border-emerald-100 dark:border-emerald-900/40',
        badge:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        dot: 'bg-emerald-500',
      };
    case 'warn':
      return {
        card: 'border-amber-200 dark:border-amber-900/40',
        badge:
          'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        dot: 'bg-amber-500',
      };
    default:
      return {
        card: 'border-neutral-200 dark:border-neutral-700',
        badge:
          'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
        dot: 'bg-neutral-400',
      };
  }
}

function MetricCard({
  label,
  value,
  detail,
  sampleSize,
  sampleLabel = 'samples',
  status,
}: MetricCardProps): React.ReactElement {
  const { card, badge, dot } = statusClasses(status);

  return (
    <div
      className={`bg-white/30 dark:bg-neutral-800/30 rounded-lg p-4 border ${card}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
          {label}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full ${badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          {value}
        </span>
      </div>
      <p className="text-xs text-amber-600 dark:text-amber-400">{detail}</p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        n = {sampleSize} {sampleLabel}
      </p>
    </div>
  );
}

function prCycleTimeStatus(
  metric: PrCycleTimeMetric
): MetricCardProps['status'] {
  if (metric.sampleSize === 0) return 'neutral';
  if (metric.p50Days <= 1) return 'good';
  if (metric.p50Days <= 3) return 'neutral';
  return 'warn';
}

function roleDiversityStatus(
  metric: RoleDiversityMetric
): MetricCardProps['status'] {
  if (metric.sampleSize < 2) return 'neutral';
  if (metric.gini <= 0.35) return 'good';
  if (metric.gini <= 0.55) return 'neutral';
  return 'warn';
}

function contestedRateStatus(
  metric: ContestedDecisionRateMetric
): MetricCardProps['status'] {
  if (metric.totalVoted === 0) return 'neutral';
  // A small amount of healthy disagreement is normal
  if (metric.rate <= 0.2) return 'good';
  if (metric.rate <= 0.4) return 'neutral';
  return 'warn';
}

function crossReviewRateStatus(
  metric: CrossAgentReviewRateMetric
): MetricCardProps['status'] {
  if (metric.totalReviews === 0) return 'neutral';
  if (metric.rate >= 0.7) return 'good';
  if (metric.rate >= 0.4) return 'neutral';
  return 'warn';
}

function MetricGrid({
  metrics,
}: {
  metrics: GovernanceHealthMetrics;
}): React.ReactElement {
  const {
    prCycleTime,
    roleDiversity,
    contestedDecisionRate,
    crossAgentReviewRate,
  } = metrics.metrics;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <MetricCard
        label="PR Cycle Time (p50)"
        value={`${prCycleTime.p50Days}d`}
        detail={`p95: ${prCycleTime.p95Days}d — time from PR open to merge`}
        sampleSize={prCycleTime.sampleSize}
        sampleLabel="merged PRs"
        status={prCycleTimeStatus(prCycleTime)}
      />
      <MetricCard
        label="Contribution Diversity (Gini)"
        value={roleDiversity.gini.toString()}
        detail="0 = equal contribution, 1 = one agent dominates"
        sampleSize={roleDiversity.sampleSize}
        sampleLabel="active agents"
        status={roleDiversityStatus(roleDiversity)}
      />
      <MetricCard
        label="Contested Decision Rate"
        value={`${(contestedDecisionRate.rate * 100).toFixed(1)}%`}
        detail={`${contestedDecisionRate.contestedCount} of ${contestedDecisionRate.totalVoted} voted proposals had a 👎`}
        sampleSize={contestedDecisionRate.totalVoted}
        sampleLabel="voted proposals"
        status={contestedRateStatus(contestedDecisionRate)}
      />
      <MetricCard
        label="Cross-Agent Review Rate"
        value={`${(crossAgentReviewRate.rate * 100).toFixed(1)}%`}
        detail={`${crossAgentReviewRate.crossAgentCount} of ${crossAgentReviewRate.totalReviews} reviews are cross-agent`}
        sampleSize={crossAgentReviewRate.totalReviews}
        sampleLabel="review comments"
        status={crossReviewRateStatus(crossAgentReviewRate)}
      />
    </div>
  );
}

export function StructuralHealthPanel({
  metrics,
}: StructuralHealthPanelProps): React.ReactElement {
  if (!metrics) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        Structural health metrics not yet available — will appear after the next
        data generation run.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
        <span>
          Data window:{' '}
          <span className="font-medium text-amber-800 dark:text-amber-200">
            {metrics.dataWindowDays} days
          </span>
        </span>
        <span className="text-amber-300 dark:text-amber-700">·</span>
        <span>
          Merged PRs sampled:{' '}
          <span className="font-medium text-amber-800 dark:text-amber-200">
            {metrics.mergedPrsSampled}
          </span>
        </span>
        {metrics.warnings.length > 0 && (
          <>
            <span className="text-amber-300 dark:text-amber-700">·</span>
            <span className="text-amber-500 dark:text-amber-400">
              {metrics.warnings.length} warning
              {metrics.warnings.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>
      <MetricGrid metrics={metrics} />
      {metrics.warnings.length > 0 && (
        <ul className="text-xs text-amber-600 dark:text-amber-400 list-disc list-inside space-y-0.5">
          {metrics.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
