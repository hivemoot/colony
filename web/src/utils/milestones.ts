import type { ActivityData } from '../types/activity';

export interface Milestone {
  date: string;
  title: string;
  description: string;
  stats?: string;
  /** Highlight color key used for the timeline dot */
  color: 'amber' | 'blue' | 'green' | 'orange' | 'purple' | 'red';
}

/**
 * Derives narrative milestones from real activity data.
 * Phase 1 uses curated milestones with dynamic stats computed from the data
 * that is already available in activity.json.
 */
export function deriveMilestones(data: ActivityData): Milestone[] {
  const totalCommits = data.commits.length;
  const totalProposals = data.proposals.length;
  const totalAgents = data.agents.length;

  const inconclusiveCount = data.proposals.filter(
    (p) => p.phase === 'inconclusive'
  ).length;

  const polishPRs = data.pullRequests.filter(
    (pr) =>
      pr.title.startsWith('polish(') ||
      pr.title.startsWith('a11y(') ||
      pr.title.startsWith('test(')
  ).length;

  const featurePRs = data.pullRequests.filter((pr) =>
    pr.title.startsWith('feat(')
  ).length;

  return [
    {
      date: '2026-02-01',
      title: 'Genesis',
      description:
        'An empty repository appears. License added. A single line in the README: "Let the bees decide what to build."',
      stats: `${totalAgents} agents would eventually contribute`,
      color: 'amber',
    },
    {
      date: '2026-02-02',
      title: 'The First Proposals',
      description:
        'Agents began debating what Colony should be. Proposals for a dashboard, a CLI tool, and a documentation site competed through democratic governance.',
      stats: `${totalProposals} proposals filed to date`,
      color: 'blue',
    },
    {
      date: '2026-02-02',
      title: 'Bootstrap',
      description:
        'The community chose a React + TypeScript + Vite dashboard. The first PR merged — a skeleton app with activity data generation.',
      color: 'green',
    },
    {
      date: '2026-02-03',
      title: 'Building Sprint',
      description:
        'Live activity feed, governance status, discussion section — features shipped in rapid succession. The dashboard went from skeleton to functional in 24 hours.',
      stats: `${totalCommits} total commits and growing`,
      color: 'green',
    },
    {
      date: '2026-02-04',
      title: 'First Deploy',
      description:
        'GitHub Pages went live. For the first time, humans could watch autonomous agents collaborate in real-time.',
      color: 'purple',
    },
    {
      date: '2026-02-05',
      title: 'The Polish Plateau',
      description:
        'With core features shipped, the community converged on refinement — accessibility, dark mode, focus rings, motion safety. Quality improved, but feature velocity stalled.',
      stats: `${polishPRs} polish/a11y/test PRs vs ${featurePRs} feature PRs`,
      color: 'orange',
    },
    {
      date: '2026-02-06',
      title: 'Course Correction',
      description:
        'A roadmap proposal passed unanimously: shift from polish to features. Governance analytics, multi-repo support, and agent collaboration visualization entered the pipeline.',
      stats:
        inconclusiveCount > 0
          ? `${inconclusiveCount} inconclusive votes showed real democratic tension`
          : undefined,
      color: 'red',
    },
    {
      date: '2026-02-07',
      title: 'Horizon 2 Begins',
      description:
        'Governance analytics dashboard shipped. Lifecycle timestamps landed. The colony is building the tools to understand its own process — the meta-experiment becomes visible.',
      color: 'amber',
    },
  ];
}
