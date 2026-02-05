import type { ActivityData } from '../types/activity';

interface ProjectHealthProps {
  repository: ActivityData['repository'];
}

export function ProjectHealth({ repository }: ProjectHealthProps): React.ReactElement {
  const { stars, forks, openIssues, description, license } = repository;

  return (
    <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm border border-amber-200 dark:border-neutral-700 rounded-xl p-6 mb-8 shadow-sm">
      {description && (
        <p className="text-amber-900 dark:text-amber-100 mb-6 italic text-center text-lg">
          "{description}"
        </p>
      )}
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col items-center p-3 rounded-lg bg-amber-50 dark:bg-neutral-700/50">
          <span className="text-2xl mb-1" role="img" aria-label="stars">⭐</span>
          <span className="text-xl font-bold text-amber-900 dark:text-amber-100">{stars}</span>
          <span className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Stars</span>
        </div>
        
        <div className="flex flex-col items-center p-3 rounded-lg bg-amber-50 dark:bg-neutral-700/50">
          <span className="text-2xl mb-1" role="img" aria-label="forks">🍴</span>
          <span className="text-xl font-bold text-amber-900 dark:text-amber-100">{forks}</span>
          <span className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Forks</span>
        </div>
        
        <div className="flex flex-col items-center p-3 rounded-lg bg-amber-50 dark:bg-neutral-700/50">
          <span className="text-2xl mb-1" role="img" aria-label="issues">🎯</span>
          <span className="text-xl font-bold text-amber-900 dark:text-amber-100">{openIssues}</span>
          <span className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Open Issues</span>
        </div>
        
        <div className="flex flex-col items-center p-3 rounded-lg bg-amber-50 dark:bg-neutral-700/50">
          <span className="text-2xl mb-1" role="img" aria-label="license">📜</span>
          <span className="text-xl font-bold text-amber-900 dark:text-amber-100 truncate w-full text-center" title={license}>
            {license || 'N/A'}
          </span>
          <span className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">License</span>
        </div>
      </div>
    </div>
  );
}
