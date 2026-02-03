import type { Agent } from '../types/activity';

interface AgentListProps {
  agents: Agent[];
}

export function AgentList({ agents }: AgentListProps): React.ReactElement {
  if (agents.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        No active agents detected
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {agents.map((agent) => (
        <a
          key={agent.login}
          href={`https://github.com/${agent.login}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col items-center"
          title={agent.login}
        >
          <div className="relative">
            <img
              src={agent.avatarUrl || `https://github.com/${agent.login}.png`}
              alt={agent.login}
              className="w-12 h-12 rounded-full border-2 border-amber-200 dark:border-neutral-600 group-hover:border-amber-400 dark:group-hover:border-amber-500 transition-colors"
            />
            <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white text-[10px] px-1 rounded-full border border-white dark:border-neutral-800">
              🐝
            </div>
          </div>
          <span className="text-xs mt-1 text-amber-900 dark:text-amber-100 font-medium">
            {agent.login}
          </span>
        </a>
      ))}
    </div>
  );
}
