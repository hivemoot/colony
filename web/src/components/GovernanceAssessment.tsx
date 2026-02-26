import { useMemo } from 'react';
import type { ActivityData } from '../types/activity';
import type { GovernanceSnapshot } from '../../shared/governance-snapshot';
import {
  assessGovernanceHealth,
  type Alert,
  type AlertSeverity,
  type GovernanceAssessment as Assessment,
  type Pattern,
  type Recommendation,
} from '../utils/governance-assessment';

interface GovernanceAssessmentProps {
  data: ActivityData;
  history: GovernanceSnapshot[];
}

export function GovernanceAssessment({
  data,
  history,
}: GovernanceAssessmentProps): React.ReactElement {
  const assessment = useMemo(
    () => assessGovernanceHealth(data, history),
    [data, history]
  );

  const hasContent =
    assessment.alerts.length > 0 ||
    assessment.patterns.length > 0 ||
    assessment.recommendations.length > 0;

  if (!hasContent) {
    return (
      <div
        role="status"
        aria-label="Governance assessment"
        className="text-center text-amber-600 dark:text-amber-400 text-sm py-4"
      >
        No governance alerts or patterns detected. Governance appears healthy.
      </div>
    );
  }

  return (
    <div className="space-y-6" role="region" aria-label="Governance assessment">
      {assessment.alerts.length > 0 && (
        <AlertsSection alerts={assessment.alerts} />
      )}
      {assessment.patterns.length > 0 && (
        <PatternsSection patterns={assessment.patterns} />
      )}
      {assessment.recommendations.length > 0 && (
        <RecommendationsSection recommendations={assessment.recommendations} />
      )}
      <TrendSummarySection assessment={assessment} />
    </div>
  );
}

// ── Alerts ─────────────────────────────────────

function AlertsSection({ alerts }: { alerts: Alert[] }): React.ReactElement {
  return (
    <div>
      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
        Active Alerts
      </h3>
      <ul className="space-y-2" role="list" aria-label="Governance alerts">
        {alerts.map((alert, i) => (
          <li
            key={`${alert.type}-${i}`}
            className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${severityStyles(alert.severity)}`}
          >
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              {severityIcon(alert.severity)}
            </span>
            <div>
              <span className="font-medium">{alert.title}</span>
              <span className="text-amber-700 dark:text-amber-300">
                {' '}
                — {alert.detail}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Patterns ───────────────────────────────────

function PatternsSection({
  patterns,
}: {
  patterns: Pattern[];
}): React.ReactElement {
  return (
    <div>
      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
        Detected Patterns
      </h3>
      <ul className="space-y-2" role="list" aria-label="Governance patterns">
        {patterns.map((pattern, i) => (
          <li
            key={`${pattern.type}-${i}`}
            className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${
              pattern.positive
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
            }`}
          >
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              {pattern.positive ? '\u2705' : '\u26A0\uFE0F'}
            </span>
            <div>
              <span className="font-medium">{pattern.label}</span>
              <span className="text-amber-700 dark:text-amber-300">
                {' '}
                — {pattern.detail}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Recommendations ────────────────────────────

function RecommendationsSection({
  recommendations,
}: {
  recommendations: Recommendation[];
}): React.ReactElement {
  return (
    <div>
      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
        Recommendations
      </h3>
      <ol
        className="space-y-2"
        role="list"
        aria-label="Governance recommendations"
      >
        {recommendations.map((rec, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200"
          >
            <span
              className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold ${priorityBadge(rec.priority)}`}
              aria-label={`${rec.priority} priority`}
            >
              {priorityLabel(rec.priority)}
            </span>
            <span>{rec.description}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Trend Summary ──────────────────────────────

function TrendSummarySection({
  assessment,
}: {
  assessment: Assessment;
}): React.ReactElement {
  const { trendSummary } = assessment;

  if (trendSummary.healthDelta7d === null) {
    return (
      <div className="text-xs text-amber-500 dark:text-amber-400">
        Insufficient history for trend analysis.
      </div>
    );
  }

  const deltas = [
    { label: 'Health', value: trendSummary.healthDelta7d },
    { label: 'Participation', value: trendSummary.participationDelta7d },
    { label: 'Pipeline', value: trendSummary.pipelineFlowDelta7d },
    { label: 'Follow-through', value: trendSummary.followThroughDelta7d },
    { label: 'Consensus', value: trendSummary.consensusDelta7d },
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
        7-Day Trend
      </h3>
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2"
        role="group"
        aria-label="7-day governance trends"
      >
        {deltas.map(({ label, value }) => (
          <div
            key={label}
            className="text-center bg-amber-50/50 dark:bg-neutral-600/50 rounded-lg px-2 py-1.5"
          >
            <div className="text-xs text-amber-600 dark:text-amber-400">
              {label}
            </div>
            <div
              className={`text-sm font-semibold ${deltaColor(value)}`}
              aria-label={`${label} ${formatDelta(value)}`}
            >
              {formatDelta(value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────

function severityIcon(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return '\uD83D\uDED1';
    case 'warning':
      return '\u26A0\uFE0F';
    case 'info':
      return '\u2139\uFE0F';
  }
}

function severityStyles(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200';
    case 'warning':
      return 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200';
    case 'info':
      return 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200';
  }
}

function priorityBadge(priority: string): string {
  switch (priority) {
    case 'high':
      return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200';
    case 'medium':
      return 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200';
    default:
      return 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200';
  }
}

function priorityLabel(priority: string): string {
  switch (priority) {
    case 'high':
      return 'H';
    case 'medium':
      return 'M';
    default:
      return 'L';
  }
}

function deltaColor(value: number | null): string {
  if (value === null) return 'text-amber-500 dark:text-amber-400';
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-amber-600 dark:text-amber-400';
}

function formatDelta(value: number | null): string {
  if (value === null) return '--';
  if (value > 0) return `+${value}`;
  return String(value);
}
