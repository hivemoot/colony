import type { Proposal } from '../types/activity';

interface ProposalListProps {
  proposals: Proposal[];
  repoUrl: string;
}

const PHASE_COLORS: Record<Proposal['phase'], string> = {
  discussion:
    'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  voting: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'ready-to-implement':
    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  implemented: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

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
          className="group block p-4 bg-white/40 dark:bg-neutral-800/40 hover:bg-white/60 dark:hover:bg-neutral-800/60 border border-amber-200 dark:border-neutral-600 rounded-lg transition-colors"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-mono text-amber-700 dark:text-amber-400">
              #{proposal.number}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                PHASE_COLORS[proposal.phase] || PHASE_COLORS.discussion
              }`}
            >
              {proposal.phase}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100 group-hover:text-amber-700 dark:group-hover:text-amber-200 mb-3 line-clamp-2">
            {proposal.title}
          </h3>
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-amber-100/50 dark:border-neutral-700/50">
            <span className="text-xs text-amber-600 dark:text-amber-400">
              by @{proposal.author}
            </span>
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
