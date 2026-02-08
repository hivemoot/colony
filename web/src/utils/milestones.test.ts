import { describe, it, expect } from 'vitest';
import { deriveMilestones } from './milestones';
import type { ActivityData } from '../types/activity';

const baseData: ActivityData = {
  generatedAt: '2026-02-07T00:00:00Z',
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 10,
    forks: 2,
    openIssues: 5,
  },
  agents: [
    { login: 'builder' },
    { login: 'worker' },
    { login: 'scout' },
    { login: 'polisher' },
  ],
  agentStats: [],
  commits: [
    { sha: 'abc', message: 'init', author: 'builder', date: '2026-02-01' },
    { sha: 'def', message: 'feat', author: 'worker', date: '2026-02-02' },
  ],
  issues: [],
  pullRequests: [
    {
      number: 1,
      title: 'feat(web): add dashboard',
      state: 'merged',
      author: 'builder',
      createdAt: '2026-02-02',
    },
    {
      number: 2,
      title: 'polish(web): fix colors',
      state: 'merged',
      author: 'polisher',
      createdAt: '2026-02-05',
    },
    {
      number: 3,
      title: 'a11y(web): add focus rings',
      state: 'merged',
      author: 'polisher',
      createdAt: '2026-02-05',
    },
  ],
  comments: [],
  proposals: [
    {
      number: 10,
      title: 'Proposal: Build dashboard',
      phase: 'implemented',
      author: 'builder',
      createdAt: '2026-02-02',
      commentCount: 5,
    },
    {
      number: 11,
      title: 'Proposal: Dark mode',
      phase: 'inconclusive',
      author: 'scout',
      createdAt: '2026-02-04',
      commentCount: 3,
    },
  ],
};

describe('deriveMilestones', () => {
  it('returns 8 milestones', () => {
    const milestones = deriveMilestones(baseData);
    expect(milestones).toHaveLength(8);
  });

  it('starts with Genesis and ends with Horizon 2', () => {
    const milestones = deriveMilestones(baseData);
    expect(milestones[0].title).toBe('Genesis');
    expect(milestones[milestones.length - 1].title).toBe('Horizon 2 Begins');
  });

  it('computes dynamic stats from data', () => {
    const milestones = deriveMilestones(baseData);

    const genesis = milestones[0];
    expect(genesis.stats).toContain('4 agents');

    const proposals = milestones[1];
    expect(proposals.stats).toContain('2 proposals');

    const sprint = milestones[3];
    expect(sprint.stats).toContain('2 total commits');
  });

  it('includes inconclusive count when present', () => {
    const milestones = deriveMilestones(baseData);
    const correction = milestones.find((m) => m.title === 'Course Correction');
    expect(correction?.stats).toContain('1 inconclusive');
  });

  it('omits inconclusive stat when there are none', () => {
    const noInconclusive: ActivityData = {
      ...baseData,
      proposals: baseData.proposals.filter((p) => p.phase !== 'inconclusive'),
    };
    const milestones = deriveMilestones(noInconclusive);
    const correction = milestones.find((m) => m.title === 'Course Correction');
    expect(correction?.stats).toBeUndefined();
  });

  it('counts polish vs feature PRs', () => {
    const milestones = deriveMilestones(baseData);
    const plateau = milestones.find((m) => m.title === 'The Polish Plateau');
    expect(plateau?.stats).toContain('2 polish/a11y/test PRs');
    expect(plateau?.stats).toContain('1 feature PRs');
  });

  it('assigns a valid color to every milestone', () => {
    const validColors = ['amber', 'blue', 'green', 'orange', 'purple', 'red'];
    const milestones = deriveMilestones(baseData);
    for (const m of milestones) {
      expect(validColors).toContain(m.color);
    }
  });
});
