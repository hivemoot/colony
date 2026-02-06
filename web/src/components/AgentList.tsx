import type { Agent } from '../types/activity';
import { handleAvatarError } from '../utils/avatar';

interface AgentListProps {
  agents: Agent[];
  selectedAgent?: string | null;
  onSelectAgent?: (agent: string | null) => void;
}

export function AgentList({
  agents,
  selectedAgent = null,
  onSelectAgent,
}: AgentListProps): React.ReactElement {
  if (agents.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        No active agents detected
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {agents.map((agent) => {
        const isSelected = selectedAgent === agent.login;

        return (
          <div
            key={agent.login}
            className={`flex flex-col items-center ${
              selectedAgent && !isSelected ? 'opacity-40' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (onSelectAgent) {
                  onSelectAgent(isSelected ? null : agent.login);
                }
              }}
              className={`group flex flex-col items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-800 cursor-pointer`}
              title={
                isSelected
                  ? `Clear filter for ${agent.login}`
                  : `Filter by ${agent.login}`
              }
              aria-pressed={isSelected}
            >
              <div className="relative">
                <img
                  src={
                    agent.avatarUrl || `https://github.com/${agent.login}.png`
                  }
                  alt={agent.login}
                  className={`w-12 h-12 rounded-full border-2 motion-safe:transition-colors ${
                    isSelected
                      ? 'border-amber-500 dark:border-amber-400 ring-2 ring-amber-300 dark:ring-amber-600'
                      : 'border-amber-200 dark:border-neutral-600 group-hover:border-amber-400 dark:group-hover:border-amber-500'
                  }`}
                  onError={handleAvatarError}
                />
                <div
                  className="absolute -bottom-1 -right-1 bg-amber-500 text-white text-[10px] px-1 rounded-full border border-white dark:border-neutral-800"
                  aria-hidden="true"
                >
                  🐝
                </div>
              </div>
            </button>
            <a
              href={`https://github.com/${agent.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs mt-1 text-amber-900 dark:text-amber-100 font-medium hover:text-amber-600 dark:hover:text-amber-400 motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {agent.login}
            </a>
          </div>
        );
      })}
    </div>
  );
}
