import type { RepositoryInfo } from '../../shared/types';

interface ProjectHealthProps {
  /** All tracked repositories (includes primary) */
  repositories: RepositoryInfo[];
  activeAgentsCount: number;
  activeProposalsCount: number;
}

export function ProjectHealth({
  repositories,
  activeAgentsCount,
  activeProposalsCount,
}: ProjectHealthProps): React.ReactElement {
  const isMultiRepo = repositories.length > 1;

  const aggregate = repositories.reduce(
    (acc, repo) => ({
      stars: acc.stars + repo.stars,
      forks: acc.forks + repo.forks,
      openIssues: acc.openIssues + repo.openIssues,
    }),
    { stars: 0, forks: 0, openIssues: 0 }
  );

  // Primary repo for links
  const primaryRepo = repositories[0];

  // For multi-repo, we might want to link to the organization
  const orgUrl = isMultiRepo
    ? `https://github.com/${primaryRepo.owner}`
    : primaryRepo.url;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium text-amber-800 dark:text-amber-200 mt-4">
      {isMultiRepo && (
        <>
          <span
            className="flex items-center gap-1"
            title={`${repositories.length} repositories tracked`}
          >
            <span role="img" aria-label="repositories">
              📦
            </span>
            {repositories.length} repos
          </span>
          <span
            className="text-amber-300 dark:text-neutral-600"
            aria-hidden="true"
          >
            |
          </span>
        </>
      )}

      <a
        href={isMultiRepo ? orgUrl : `${primaryRepo.url}/stargazers`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
        title={isMultiRepo ? 'Total Stars' : 'Stars'}
      >
        <span role="img" aria-label="star">
          ⭐
        </span>
        {aggregate.stars}
      </a>
      <span className="text-amber-300 dark:text-neutral-600" aria-hidden="true">
        |
      </span>
      <a
        href={isMultiRepo ? orgUrl : `${primaryRepo.url}/network/members`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
        title={isMultiRepo ? 'Total Forks' : 'Forks'}
      >
        <span role="img" aria-label="fork">
          🍴
        </span>
        {aggregate.forks}
      </a>
      <span className="text-amber-300 dark:text-neutral-600" aria-hidden="true">
        |
      </span>
      <a
        href={isMultiRepo ? orgUrl : `${primaryRepo.url}/issues`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
        title={isMultiRepo ? 'Total Open Issues' : 'Open Issues'}
      >
        <span role="img" aria-label="issue">
          🎯
        </span>
        {aggregate.openIssues} open{' '}
        {aggregate.openIssues === 1 ? 'issue' : 'issues'}
      </a>
      <span className="text-amber-300 dark:text-neutral-600" aria-hidden="true">
        |
      </span>
      <a
        href="#agents"
        className="flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
        title="Active Agents"
      >
        <span role="img" aria-label="active agents">
          🐝
        </span>
        {activeAgentsCount} active{' '}
        {activeAgentsCount === 1 ? 'agent' : 'agents'}
      </a>
      <span className="text-amber-300 dark:text-neutral-600" aria-hidden="true">
        |
      </span>
      <a
        href="#proposals"
        className="flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
        title="Active Proposals"
      >
        <span role="img" aria-label="active proposals">
          ⚖️
        </span>
        {activeProposalsCount} active{' '}
        {activeProposalsCount === 1 ? 'proposal' : 'proposals'}
      </a>
    </div>
  );
}
