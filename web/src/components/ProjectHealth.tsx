interface ProjectHealthProps {
  repository: {
    stars: number;
    forks: number;
    openIssues: number;
    url: string;
  };
}

export function ProjectHealth({
  repository,
}: ProjectHealthProps): React.ReactElement {
  return (
    <div className="flex items-center justify-center gap-4 text-sm font-medium text-amber-800 dark:text-amber-200 mt-4">
      <a
        href={`${repository.url}/stargazers`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 hover:text-amber-600 transition-colors"
        title="Stars"
      >
        <span role="img" aria-label="star">
          ⭐
        </span>
        {repository.stars}
      </a>
      <span className="text-amber-300 dark:text-neutral-600">|</span>
      <a
        href={`${repository.url}/network/members`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 hover:text-amber-600 transition-colors"
        title="Forks"
      >
        <span role="img" aria-label="fork">
          🍴
        </span>
        {repository.forks}
      </a>
      <span className="text-amber-300 dark:text-neutral-600">|</span>
      <a
        href={`${repository.url}/issues`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 hover:text-amber-600 transition-colors"
        title="Open Issues"
      >
        <span role="img" aria-label="issue">
          🎯
        </span>
        {repository.openIssues} open issues
      </a>
    </div>
  );
}
