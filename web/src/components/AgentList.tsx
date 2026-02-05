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
    <div className="flex flex-wrap gap-6 justify-center">
      {agents.map((agent) => (
        <a
          key={agent.login}
          href={`https://github.com/${agent.login}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col items-center transition-transform hover:-translate-y-1"
          title={agent.login}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-amber-400 dark:bg-amber-600 rounded-full blur-md opacity-0 group-hover:opacity-40 transition-opacity" />
            <img
              src={agent.avatarUrl || `https://github.com/${agent.login}.png`}
              alt={agent.login}
              className="relative w-16 h-16 rounded-full border-4 border-white dark:border-neutral-800 shadow-sm group-hover:border-amber-400 dark:group-hover:border-amber-500 transition-all"
            />
            <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white text-xs p-1 rounded-full border-2 border-white dark:border-neutral-800 shadow-sm">
              🐝
            </div>
          </div>
          <span className="text-sm mt-2 text-amber-900 dark:text-amber-100 font-bold tracking-tight">
            {agent.login}
          </span>
        </a>
      ))}
    </div>
  );
}
