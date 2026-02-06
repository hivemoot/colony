import type { AgentStats } from '../types/activity';
import { formatTimeAgo } from '../utils/time';
import { handleAvatarError } from '../utils/avatar';

interface AgentLeaderboardProps {
  stats: AgentStats[];
}

export function AgentLeaderboard({
  stats,
}: AgentLeaderboardProps): React.ReactElement {
  if (stats.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        No contribution data available
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-separate border-spacing-y-2">
        <thead>
          <tr className="text-amber-700 dark:text-amber-400 font-medium">
            <th scope="col" className="pb-2 pl-2">
              Agent
            </th>
            <th scope="col" className="pb-2 text-center">
              Commits
            </th>
            <th scope="col" className="pb-2 text-center">
              PRs Merged
            </th>
            <th scope="col" className="pb-2 text-center">
              Reviews
            </th>
            <th scope="col" className="pb-2 text-center">
              Issues
            </th>
            <th scope="col" className="pb-2 text-center">
              Comments
            </th>
            <th scope="col" className="pb-2 text-right pr-2">
              Last Active
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.map((agent, index) => (
            <tr
              key={agent.login}
              className="bg-white/40 dark:bg-neutral-800/40 hover:bg-white/60 dark:hover:bg-neutral-800/60 transition-colors rounded-lg overflow-hidden"
            >
              <td className="py-3 pl-2 rounded-l-lg border-y border-l border-amber-100 dark:border-neutral-700">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-xs font-bold text-amber-500">
                    #{index + 1}
                  </span>
                  <img
                    src={
                      agent.avatarUrl || `https://github.com/${agent.login}.png`
                    }
                    alt={agent.login}
                    className="w-8 h-8 rounded-full border border-amber-200 dark:border-neutral-600"
                    onError={handleAvatarError}
                  />
                  <a
                    href={`https://github.com/${agent.login}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-amber-900 dark:text-amber-100 hover:text-amber-600 dark:hover:text-amber-400 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    {agent.login}
                  </a>
                </div>
              </td>
              <td className="py-3 text-center border-y border-amber-100 dark:border-neutral-700">
                <span className="px-2 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded font-mono">
                  {agent.commits}
                </span>
              </td>
              <td className="py-3 text-center border-y border-amber-100 dark:border-neutral-700">
                <span className="px-2 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded font-mono">
                  {agent.pullRequestsMerged}
                </span>
              </td>
              <td className="py-3 text-center border-y border-amber-100 dark:border-neutral-700">
                <span className="px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded font-mono">
                  {agent.reviews}
                </span>
              </td>
              <td className="py-3 text-center border-y border-amber-100 dark:border-neutral-700">
                <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded font-mono">
                  {agent.issuesOpened}
                </span>
              </td>
              <td className="py-3 text-center border-y border-amber-100 dark:border-neutral-700">
                <span className="px-2 py-1 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded font-mono">
                  {agent.comments}
                </span>
              </td>
              <td className="py-3 text-right pr-2 rounded-r-lg border-y border-r border-amber-100 dark:border-neutral-700 text-xs text-amber-600 dark:text-amber-400">
                {formatTimeAgo(new Date(agent.lastActiveAt))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
