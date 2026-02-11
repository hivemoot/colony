import { useMemo } from 'react';
import type {
  ActivityData,
  GovernanceIncidentCategory,
  GovernanceIncidentSeverity,
} from '../types/activity';
import {
  computeGovernanceOpsReport,
  type GovernanceSLOStatus,
  type ReliabilityMode,
} from '../utils/governance-ops';

interface GovernanceOpsProps {
  data: ActivityData;
}

const STATUS_STYLES: Record<
  GovernanceSLOStatus,
  { badge: string; label: string }
> = {
  pass: {
    badge:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    label: 'PASS',
  },
  warn: {
    badge:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    label: 'WARN',
  },
  fail: {
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    label: 'FAIL',
  },
};

const MODE_STYLES: Record<ReliabilityMode, { dot: string; label: string }> = {
  healthy: {
    dot: 'bg-emerald-500',
    label: 'Healthy',
  },
  watch: {
    dot: 'bg-amber-500',
    label: 'Watch',
  },
  stabilize: {
    dot: 'bg-red-500',
    label: 'Stabilize',
  },
};

const INCIDENT_LABELS: Record<GovernanceIncidentCategory, string> = {
  permissions: 'Permissions',
  'automation-failure': 'Automation',
  coordination: 'Coordination',
  process: 'Process',
  visibility: 'Visibility',
};

const SEVERITY_STYLES: Record<GovernanceIncidentSeverity, string> = {
  low: 'text-sky-700 dark:text-sky-300',
  medium: 'text-amber-700 dark:text-amber-300',
  high: 'text-red-700 dark:text-red-300',
};

export function GovernanceOps({
  data,
}: GovernanceOpsProps): React.ReactElement {
  const report = useMemo(() => computeGovernanceOpsReport(data), [data]);
  const modeMeta = MODE_STYLES[report.reliabilityBudget.mode];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-100 dark:border-neutral-700 bg-white/30 dark:bg-neutral-800/30 p-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Reliability Budget
            </p>
            <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">
              {report.reliabilityBudget.remaining}%
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 dark:border-neutral-600 px-3 py-1.5 bg-amber-50 dark:bg-neutral-900">
            <span
              aria-hidden="true"
              className={`inline-block h-2.5 w-2.5 rounded-full ${modeMeta.dot}`}
            />
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {modeMeta.label}
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          {report.reliabilityBudget.guidance}
        </p>
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          SLO outcomes: {report.reliabilityBudget.passCount} pass,{' '}
          {report.reliabilityBudget.warnCount} warn,{' '}
          {report.reliabilityBudget.failCount} fail.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {report.checks.map((check) => {
          const meta = STATUS_STYLES[check.status];
          return (
            <div
              key={check.id}
              className="rounded-lg border border-amber-100 dark:border-neutral-700 bg-white/30 dark:bg-neutral-800/30 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  {check.label}
                </p>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}
                >
                  {meta.label}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-200">
                {check.value}
              </p>
              <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                Target: {check.target}
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {check.detail}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-amber-100 dark:border-neutral-700 bg-white/30 dark:bg-neutral-800/30 p-4">
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          Incident Taxonomy
        </h3>
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Open incidents grouped by machine-readable category.
        </p>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(Object.keys(INCIDENT_LABELS) as GovernanceIncidentCategory[]).map(
            (category) => (
              <div
                key={category}
                className="rounded-md border border-amber-100 dark:border-neutral-700 bg-amber-50/70 dark:bg-neutral-900/60 px-2 py-1.5 text-center"
              >
                <p className="text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  {INCIDENT_LABELS[category]}
                </p>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  {report.incidents.byCategory[category]}
                </p>
              </div>
            )
          )}
        </div>

        {report.incidents.open.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {report.incidents.open.slice(0, 3).map((incident) => (
              <li
                key={incident.id}
                className="text-xs text-amber-700 dark:text-amber-300"
              >
                <span
                  className={`font-semibold ${SEVERITY_STYLES[incident.severity]}`}
                >
                  {incident.severity.toUpperCase()}
                </span>{' '}
                <span className="font-medium">{incident.title}</span>
                {incident.sourceUrl && (
                  <a
                    href={incident.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 rounded"
                  >
                    source
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
            No open governance incidents detected.
          </p>
        )}
      </div>
    </div>
  );
}
