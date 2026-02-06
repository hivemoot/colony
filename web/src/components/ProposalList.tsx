import type { Proposal } from '../types/activity';
import { handleAvatarError } from '../utils/avatar';

interface ProposalListProps {
  proposals: Proposal[];
  repoUrl: string;
}

export function ProposalList({
  proposals,
  repoUrl,
}: ProposalListProps): React.ReactElement {
  if (proposals.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic text-center py-4">
        No active proposals
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {proposals.map((proposal) => (
        <a
          key={proposal.number}
          href={`${repoUrl}/issues/${proposal.number}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group block p-4 bg-white/40 dark:bg-neutral-800/40 hover:bg-white/60 dark:hover:bg-neutral-800/60 border border-amber-200 dark:border-neutral-600 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-mono text-amber-700 dark:text-amber-400">
              #{proposal.number}
            </span>
            <PhaseBadge phase={proposal.phase} />
          </div>
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100 group-hover:text-amber-700 dark:group-hover:text-amber-200 mb-3 line-clamp-2">
            {proposal.title}
          </h3>
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-amber-100/50 dark:border-neutral-700/50">
            <div className="flex items-center gap-2">
              <img
                src={`https://github.com/${proposal.author}.png`}
                alt={proposal.author}
                className="w-4 h-4 rounded-full border border-amber-200 dark:border-neutral-600"
                onError={handleAvatarError}
              />
              <span className="text-xs text-amber-600 dark:text-amber-400">
                @{proposal.author}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {proposal.votesSummary && (
                <div className="flex items-center gap-2 text-[11px] font-medium">
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
                    👍 {proposal.votesSummary.thumbsUp}
                  </span>
                  <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5">
                    👎 {proposal.votesSummary.thumbsDown}
                  </span>
                </div>
              )}
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                💬 {proposal.commentCount}
              </span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function PhaseBadge({
  phase,
}: {
  phase: Proposal['phase'];
}): React.ReactElement {
  const styles = {
    discussion:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-800',
    voting:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border-blue-200 dark:border-blue-800',
    'ready-to-implement':
      'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200 border-green-200 dark:border-green-800',
    implemented:
      'bg-neutral-100 text-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-200 border-neutral-200 dark:border-neutral-800',
    rejected:
      'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 border-red-200 dark:border-red-800',
  };

  return (
    <span
      className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${styles[phase]}`}
    >
      {phase.replace(/-/g, ' ')}
    </span>
  );
}
