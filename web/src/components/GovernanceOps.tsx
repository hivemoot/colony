import type {
  GovernanceIncident,
  GovernanceOps as GovernanceOpsData,
  GovernanceSLO,
} from '../../shared/types';

interface GovernanceOpsProps {
  data?: GovernanceOpsData;
}

function overallStatusMeta(status: GovernanceOpsData['status']): {
  label: string;
  dotClass: string;
} {
  if (status === 'green') {
    return { label: 'Healthy', dotClass: 'bg-emerald-500' };
  }
  if (status === 'yellow') {
    return { label: 'At Risk', dotClass: 'bg-amber-500' };
  }
  return { label: 'Critical', dotClass: 'bg-red-500' };
}

function sloStatusClass(status: GovernanceSLO['status']): string {
  if (status === 'healthy') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'at-risk') return 'text-amber-700 dark:text-amber-400';
  return 'text-red-700 dark:text-red-400';
}

function severityClass(severity: GovernanceIncident['severity']): string {
  if (severity === 'high') return 'text-red-700 dark:text-red-400';
  if (severity === 'medium') return 'text-amber-700 dark:text-amber-400';
  return 'text-amber-700 dark:text-amber-300';
}

function readableIncidentClass(value: GovernanceIncident['class']): string {
  return value.replace(/-/g, ' ');
}

export function GovernanceOps({
  data,
}: GovernanceOpsProps): React.ReactElement | null {
  if (!data) {
    return null;
  }

  const status = overallStatusMeta(data.status);

  return (
    <section
      id="ops"
      aria-labelledby="ops-heading"
      className="w-full max-w-6xl mt-6 px-4 scroll-mt-28"
    >
      <div className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2
              id="ops-heading"
              className="text-xl font-bold text-amber-900 dark:text-amber-100"
            >
              Governance Ops
            </h2>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
              Reliability SLOs and active governance incidents.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 dark:border-neutral-600 px-3 py-1.5 bg-amber-50 dark:bg-neutral-900">
            <span
              aria-hidden="true"
              className={`inline-block h-2.5 w-2.5 rounded-full ${status.dotClass}`}
            />
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {status.label} ({data.score}/100)
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.slos.map((slo) => (
            <article
              key={slo.id}
              className="rounded-lg border border-amber-100 dark:border-neutral-700 bg-white/50 dark:bg-neutral-800/40 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  {slo.label}
                </h3>
                <span
                  className={`text-xs font-semibold uppercase tracking-wide ${sloStatusClass(slo.status)}`}
                >
                  {slo.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Target: {slo.target}
              </p>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mt-1">
                {slo.current}
              </p>
              {slo.details && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1.5">
                  {slo.details}
                </p>
              )}
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-amber-100 dark:border-neutral-700 bg-white/50 dark:bg-neutral-800/40 p-4">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Active Incidents
          </h3>
          {data.incidents.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
              No active incidents detected.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data.incidents.map((incident) => (
                <li
                  key={incident.id}
                  className="rounded-md border border-amber-100 dark:border-neutral-700 bg-amber-50/60 dark:bg-neutral-900/40 p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                      {incident.marker}
                    </span>
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      {readableIncidentClass(incident.class)}
                    </span>
                    <span
                      className={`text-xs font-semibold uppercase ${severityClass(incident.severity)}`}
                    >
                      {incident.severity}
                    </span>
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      {incident.ageHours}h open
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    {incident.summary}
                  </p>
                  <a
                    href={incident.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex mt-1 text-xs text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 rounded"
                  >
                    Open {incident.sourceType} #{incident.sourceNumber}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 rounded-lg border border-amber-100 dark:border-neutral-700 bg-white/50 dark:bg-neutral-800/40 p-4">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Reliability Budget
          </h3>
          <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 mt-1">
            {data.reliabilityBudget.remaining}%
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            {data.reliabilityBudget.policy}
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-100 mt-2">
            {data.reliabilityBudget.recommendation}
          </p>
        </div>
      </div>
    </section>
  );
}
