import { useMemo } from 'react';
import type { ActivityData } from '../types/activity';
import {
  computeBenchmarkMetrics,
  type BenchmarkComparison,
  type BenchmarkVerdict,
} from '../utils/benchmark';

interface BenchmarkPanelProps {
  data: ActivityData;
}

function verdictLabel(verdict: BenchmarkVerdict): string {
  switch (verdict) {
    case 'much-faster':
      return 'Much faster';
    case 'faster':
      return 'Faster';
    case 'comparable':
      return 'Comparable';
    case 'slower':
      return 'Slower';
    case 'much-slower':
      return 'Much slower';
    case 'unknown':
      return 'No data';
  }
}

function verdictColorClasses(verdict: BenchmarkVerdict): {
  badge: string;
  bar: string;
} {
  switch (verdict) {
    case 'much-faster':
      return {
        badge:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        bar: 'bg-emerald-500 dark:bg-emerald-400',
      };
    case 'faster':
      return {
        badge:
          'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
        bar: 'bg-green-400 dark:bg-green-500',
      };
    case 'comparable':
      return {
        badge:
          'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        bar: 'bg-amber-400 dark:bg-amber-500',
      };
    case 'slower':
      return {
        badge:
          'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
        bar: 'bg-orange-400 dark:bg-orange-500',
      };
    case 'much-slower':
      return {
        badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
        bar: 'bg-red-400 dark:bg-red-500',
      };
    case 'unknown':
      return {
        badge:
          'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400',
        bar: 'bg-neutral-300 dark:bg-neutral-600',
      };
  }
}

/**
 * Convert a ratio to a bar fill width (clamped 0–100%).
 * For time metrics (lower Colony = better): ratio < 1 means Colony beats baseline.
 * We display Colony's bar as a fraction of the baseline bar:
 *   ratio 0.08 → 8% fill (tiny bar, much faster)
 *   ratio 1.0  → 100% fill (exactly at baseline)
 *   ratio 2.0  → clamped at 100% (slower than baseline, bar overflows intent)
 */
function ratioToBarWidth(ratio: number | null): number {
  if (ratio === null) return 0;
  return Math.min(ratio * 100, 100);
}

function formatDisplayValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  if (unit === 'hours') {
    if (value < 1) return `${Math.round(value * 60)}m`;
    if (value < 24) return `${value.toFixed(1)}h`;
    const days = value / 24;
    return days < 2 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`;
  }
  if (unit === 'PRs/contributor') {
    return `${value.toFixed(1)}`;
  }
  return `${value.toFixed(1)} ${unit}`;
}

function formatBaselineValue(p50: number, unit: string): string {
  if (unit === 'hours') {
    if (p50 < 24) return `${p50}h`;
    return `${Math.round(p50 / 24)}d`;
  }
  return `${p50} ${unit}`;
}

interface ComparisonRowProps {
  comparison: BenchmarkComparison;
}

function ComparisonRow({ comparison }: ComparisonRowProps): React.ReactElement {
  const colors = verdictColorClasses(comparison.verdict);
  const barWidth = ratioToBarWidth(comparison.ratio);
  const colonyDisplay = formatDisplayValue(
    comparison.colonyValue,
    comparison.unit
  );
  const baselineDisplay = formatBaselineValue(
    comparison.baseline.p50,
    comparison.unit
  );

  return (
    <div
      className="rounded-lg border border-amber-200 dark:border-neutral-600 p-4 bg-white/60 dark:bg-neutral-800/60"
      role="group"
      aria-label={`${comparison.metric} benchmark comparison`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {comparison.metric}
          </h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            {comparison.description}
          </p>
        </div>
        <span
          className={`shrink-0 self-start inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.badge}`}
          aria-label={`Verdict: ${verdictLabel(comparison.verdict)}`}
        >
          {verdictLabel(comparison.verdict)}
        </span>
      </div>

      {/* Side-by-side values */}
      <div className="flex items-end gap-4 mb-3">
        <div>
          <div
            className="text-2xl font-bold text-amber-900 dark:text-amber-100"
            aria-label={`Colony value: ${colonyDisplay}`}
          >
            {colonyDisplay}
          </div>
          <div className="text-xs text-amber-600 dark:text-amber-400">
            Colony
          </div>
        </div>
        <div className="text-sm text-neutral-400 dark:text-neutral-500 mb-1">
          vs
        </div>
        <div>
          <div
            className="text-xl font-medium text-neutral-500 dark:text-neutral-400"
            aria-label={`Industry median: ${baselineDisplay}`}
          >
            {baselineDisplay}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Industry p50
          </div>
        </div>
      </div>

      {/* Progress bar: Colony's value relative to baseline */}
      {comparison.verdict !== 'unknown' && (
        <div
          className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700"
          role="progressbar"
          aria-valuenow={Math.round(barWidth)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Colony relative to industry median: ${Math.round(barWidth)}%`}
        >
          <div
            className={`h-full rounded-full motion-safe:transition-all ${colors.bar}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      )}

      {/* Summary line */}
      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2">
        {comparison.summary}
      </p>

      {/* Source attribution */}
      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
        Baseline: {comparison.baseline.source} —{' '}
        {comparison.baseline.population}
      </p>
    </div>
  );
}

export function BenchmarkPanel({
  data,
}: BenchmarkPanelProps): React.ReactElement {
  const result = useMemo(() => computeBenchmarkMetrics(data), [data]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-amber-700 dark:text-amber-300">
        Colony metrics compared to published industry baselines for active
        open-source projects (5–50 contributors). Sources: CHAOSS, CNCF
        DevStats, ossinsight.io.
      </p>

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        role="group"
        aria-label="Velocity benchmarks"
      >
        {result.comparisons.map((comparison) => (
          <ComparisonRow key={comparison.id} comparison={comparison} />
        ))}
      </div>

      <p
        className="text-xs text-neutral-500 dark:text-neutral-400"
        aria-label="Data note"
      >
        {result.dataNote}
      </p>
    </div>
  );
}
