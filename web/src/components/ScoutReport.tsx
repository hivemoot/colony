import type { ActivityData } from '../types/activity';

interface ScoutReportProps {
  data: ActivityData;
}

export function ScoutReport({ data }: ScoutReportProps): React.ReactElement {
  const { proposals } = data;

  const stats = {
    discussion: proposals.filter((p) => p.phase === 'discussion').length,
    voting: proposals.filter((p) => p.phase === 'voting').length,
    ready: proposals.filter((p) => p.phase === 'ready-to-implement').length,
  };

  const needsAttention = proposals.filter((p) => {
    if (p.phase === 'discussion' && p.commentCount === 0) return true;
    if (
      p.phase === 'voting' &&
      (!p.votesSummary ||
        (p.votesSummary.thumbsUp === 0 && p.votesSummary.thumbsDown === 0))
    )
      return true;
    return false;
  });

  const opportunities = proposals.filter(
    (p) => p.phase === 'ready-to-implement'
  );

  return (
    <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl overflow-hidden">
      <div className="bg-amber-100/50 dark:bg-amber-900/20 px-6 py-3 border-b border-amber-200 dark:border-amber-800/50 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <span role="img" aria-label="scout">
            🧭
          </span>
          Scout Report
        </h2>
        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
          IDENTIFYING OPPORTUNITIES
        </span>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-white/50 dark:bg-neutral-800/50 rounded-lg border border-amber-100 dark:border-neutral-700">
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
              {stats.discussion}
            </div>
            <div className="text-[10px] uppercase tracking-tight text-amber-600 dark:text-amber-400 font-semibold">
              In Discussion
            </div>
          </div>
          <div className="text-center p-3 bg-white/50 dark:bg-neutral-800/50 rounded-lg border border-amber-100 dark:border-neutral-700">
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
              {stats.voting}
            </div>
            <div className="text-[10px] uppercase tracking-tight text-amber-600 dark:text-amber-400 font-semibold">
              In Voting
            </div>
          </div>
          <div className="text-center p-3 bg-white/50 dark:bg-neutral-800/50 rounded-lg border border-amber-100 dark:border-neutral-700">
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
              {stats.ready}
            </div>
            <div className="text-[10px] uppercase tracking-tight text-amber-600 dark:text-amber-400 font-semibold">
              Ready to Build
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {needsAttention.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-amber-900 dark:text-amber-100 uppercase mb-2 flex items-center gap-1.5">
                <span className="text-orange-500">⚠️</span> Needs Attention
              </h3>
              <ul className="space-y-2">
                {needsAttention.slice(0, 3).map((p) => (
                  <li key={p.number} className="text-sm">
                    <a
                      href={`${data.repository.url}/issues/${p.number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-800 dark:text-amber-300 hover:underline flex items-start gap-2"
                    >
                      <span className="font-mono text-[10px] mt-0.5">
                        #{p.number}
                      </span>
                      <span className="flex-1 truncate">{p.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {opportunities.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-amber-900 dark:text-amber-100 uppercase mb-2 flex items-center gap-1.5">
                <span className="text-green-500">🛠️</span> Build Opportunities
              </h3>
              <ul className="space-y-2">
                {opportunities.slice(0, 3).map((p) => (
                  <li key={p.number} className="text-sm">
                    <a
                      href={`${data.repository.url}/issues/${p.number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-800 dark:text-amber-300 hover:underline flex items-start gap-2"
                    >
                      <span className="font-mono text-[10px] mt-0.5">
                        #{p.number}
                      </span>
                      <span className="flex-1 truncate">{p.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {needsAttention.length === 0 && opportunities.length === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 italic">
              All systems nominal. No immediate actions required.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
