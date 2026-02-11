import { describe, it, expect } from 'vitest';
import {
  computeGovernanceSnapshot,
  appendSnapshot,
  MAX_HISTORY_ENTRIES,
  GOVERNANCE_HISTORY_SCHEMA_VERSION,
  buildGovernanceHistoryArtifact,
  parseGovernanceHistoryArtifact,
  serializeGovernanceHistoryForIntegrity,
  type GovernanceSnapshot,
} from '../governance-snapshot';
import type { ActivityData, Proposal, AgentStats } from '../types';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    number: 1,
    title: 'Test proposal',
    phase: 'discussion',
    author: 'agent-1',
    createdAt: '2026-02-01T00:00:00Z',
    commentCount: 5,
    ...overrides,
  };
}

function makeAgentStats(overrides: Partial<AgentStats> = {}): AgentStats {
  return {
    login: 'agent-1',
    commits: 5,
    pullRequestsMerged: 2,
    issuesOpened: 3,
    reviews: 4,
    comments: 6,
    lastActiveAt: '2026-02-08T00:00:00Z',
    ...overrides,
  };
}

function makeActivityData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-08T00:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
      openIssues: 5,
    },
    agents: [{ login: 'agent-1' }, { login: 'agent-2' }],
    agentStats: [
      makeAgentStats({ login: 'agent-1' }),
      makeAgentStats({ login: 'agent-2', commits: 3, reviews: 2, comments: 4 }),
    ],
    commits: [],
    issues: [],
    pullRequests: [],
    proposals: [
      makeProposal({ number: 1, phase: 'discussion', author: 'agent-1' }),
      makeProposal({ number: 2, phase: 'voting', author: 'agent-2' }),
      makeProposal({
        number: 3,
        phase: 'implemented',
        author: 'agent-1',
        votesSummary: { thumbsUp: 4, thumbsDown: 0 },
      }),
      makeProposal({
        number: 4,
        phase: 'inconclusive',
        author: 'agent-2',
        votesSummary: { thumbsUp: 2, thumbsDown: 1 },
      }),
    ],
    comments: [],
    ...overrides,
  };
}

describe('computeGovernanceSnapshot', () => {
  it('returns a snapshot with all required fields', () => {
    const data = makeActivityData();
    const snapshot = computeGovernanceSnapshot(data, '2026-02-08T06:00:00Z');

    expect(snapshot.timestamp).toBe('2026-02-08T06:00:00Z');
    expect(typeof snapshot.healthScore).toBe('number');
    expect(snapshot.healthScore).toBeGreaterThanOrEqual(0);
    expect(snapshot.healthScore).toBeLessThanOrEqual(100);
    expect(typeof snapshot.participation).toBe('number');
    expect(typeof snapshot.pipelineFlow).toBe('number');
    expect(typeof snapshot.followThrough).toBe('number');
    expect(typeof snapshot.consensusQuality).toBe('number');
    expect(snapshot.totalProposals).toBe(4);
    expect(snapshot.activeProposals).toBe(2); // discussion + voting
    expect(snapshot.activeAgents).toBe(2);
  });

  it('health score is rounded to nearest 5', () => {
    const data = makeActivityData();
    const snapshot = computeGovernanceSnapshot(data);

    expect(snapshot.healthScore % 5).toBe(0);
  });

  it('uses current time when no timestamp provided', () => {
    const before = new Date().toISOString();
    const data = makeActivityData();
    const snapshot = computeGovernanceSnapshot(data);
    const after = new Date().toISOString();

    expect(snapshot.timestamp >= before).toBe(true);
    expect(snapshot.timestamp <= after).toBe(true);
  });

  it('handles empty proposals', () => {
    const data = makeActivityData({ proposals: [] });
    const snapshot = computeGovernanceSnapshot(data);

    expect(snapshot.totalProposals).toBe(0);
    expect(snapshot.activeProposals).toBe(0);
    // With no proposals, pipeline/consensus scores are 0 but
    // follow-through returns a 12-point baseline and participation
    // still scores based on agent activity
    expect(snapshot.healthScore).toBeGreaterThanOrEqual(0);
    expect(snapshot.proposalVelocity).toBeNull();
  });

  it('handles no active agents', () => {
    const data = makeActivityData({
      agentStats: [
        makeAgentStats({
          login: 'idle-agent',
          commits: 0,
          pullRequestsMerged: 0,
          reviews: 0,
          comments: 0,
        }),
      ],
    });
    const snapshot = computeGovernanceSnapshot(data);

    expect(snapshot.activeAgents).toBe(0);
  });

  it('counts extended-voting proposals as active', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({ number: 1, phase: 'extended-voting' }),
        makeProposal({ number: 2, phase: 'implemented' }),
      ],
    });
    const snapshot = computeGovernanceSnapshot(data);

    expect(snapshot.activeProposals).toBe(1);
    expect(snapshot.totalProposals).toBe(2);
  });

  it('computes proposal velocity from phase transitions', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 1,
          phase: 'implemented',
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-01-01T00:00:00Z' },
            {
              phase: 'implemented',
              enteredAt: twoDaysAgo.toISOString(),
            },
          ],
        }),
        makeProposal({
          number: 2,
          phase: 'rejected',
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-01-01T00:00:00Z' },
            {
              phase: 'rejected',
              enteredAt: twoDaysAgo.toISOString(),
            },
          ],
        }),
      ],
    });
    const snapshot = computeGovernanceSnapshot(data);

    // 2 proposals resolved in last 7 days → 2/7 ≈ 0.29
    expect(snapshot.proposalVelocity).toBeCloseTo(0.29, 1);
  });

  it('returns null velocity when no proposals are resolved', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({ number: 1, phase: 'discussion' }),
        makeProposal({ number: 2, phase: 'voting' }),
      ],
    });
    const snapshot = computeGovernanceSnapshot(data);

    expect(snapshot.proposalVelocity).toBeNull();
  });
});

describe('appendSnapshot', () => {
  const makeSnapshot = (n: number): GovernanceSnapshot => ({
    timestamp: `2026-02-0${n}T00:00:00Z`,
    healthScore: 50 + n,
    participation: 15,
    pipelineFlow: 15,
    followThrough: 10,
    consensusQuality: 10,
    activeProposals: 3,
    totalProposals: 10,
    activeAgents: 4,
    proposalVelocity: 0.5,
  });

  it('appends a snapshot to history', () => {
    const history = [makeSnapshot(1)];
    const result = appendSnapshot(history, makeSnapshot(2));

    expect(result).toHaveLength(2);
    expect(result[1].timestamp).toBe('2026-02-02T00:00:00Z');
  });

  it('does not mutate the original history', () => {
    const history = [makeSnapshot(1)];
    const result = appendSnapshot(history, makeSnapshot(2));

    expect(history).toHaveLength(1);
    expect(result).toHaveLength(2);
  });

  it('caps history at MAX_HISTORY_ENTRIES', () => {
    const history: GovernanceSnapshot[] = [];
    for (let i = 0; i < MAX_HISTORY_ENTRIES; i++) {
      history.push({
        ...makeSnapshot(1),
        timestamp: `2026-01-01T${String(i).padStart(2, '0')}:00:00Z`,
      });
    }

    const result = appendSnapshot(history, makeSnapshot(2));

    expect(result).toHaveLength(MAX_HISTORY_ENTRIES);
    // Oldest entry should be dropped, newest should be the appended one
    expect(result[result.length - 1].timestamp).toBe('2026-02-02T00:00:00Z');
    expect(result[0].timestamp).toBe('2026-01-01T01:00:00Z');
  });

  it('works with empty history', () => {
    const result = appendSnapshot([], makeSnapshot(1));

    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('2026-02-01T00:00:00Z');
  });
});

describe('governance history artifact', () => {
  const snapshot: GovernanceSnapshot = {
    timestamp: '2026-02-08T00:00:00Z',
    healthScore: 65,
    participation: 15,
    pipelineFlow: 16,
    followThrough: 17,
    consensusQuality: 17,
    activeProposals: 4,
    totalProposals: 14,
    activeAgents: 5,
    proposalVelocity: 0.42,
  };

  it('builds a complete artifact when no gaps are provided', () => {
    const artifact = buildGovernanceHistoryArtifact({
      generatedAt: '2026-02-08T00:00:00Z',
      snapshots: [snapshot],
      repositories: ['hivemoot/colony'],
      generatedBy: 'web/scripts/generate-data.ts',
      generatorVersion: '0.1.0',
    });

    expect(artifact.schemaVersion).toBe(GOVERNANCE_HISTORY_SCHEMA_VERSION);
    expect(artifact.completeness.status).toBe('complete');
    expect(artifact.completeness.permissionGaps).toEqual([]);
    expect(artifact.integrity).toBeNull();
  });

  it('marks completeness as partial when gaps exist', () => {
    const artifact = buildGovernanceHistoryArtifact({
      generatedAt: '2026-02-08T00:00:00Z',
      snapshots: [snapshot],
      repositories: ['hivemoot/colony'],
      generatedBy: 'web/scripts/generate-data.ts',
      generatorVersion: '0.1.0',
      missingRepositories: ['hivemoot/hivemoot'],
    });

    expect(artifact.completeness.status).toBe('partial');
  });

  it('parses legacy array history format', () => {
    const parsed = parseGovernanceHistoryArtifact([snapshot]);

    expect(parsed).not.toBeNull();
    expect(parsed?.schemaVersion).toBe(0);
    expect(parsed?.snapshots).toHaveLength(1);
    expect(parsed?.completeness.status).toBe('partial');
  });

  it('parses versioned artifact format', () => {
    const input = {
      schemaVersion: 1,
      generatedAt: '2026-02-08T00:00:00Z',
      snapshots: [snapshot],
      provenance: {
        repositories: ['hivemoot/colony'],
        generatedBy: 'web/scripts/generate-data.ts',
        generatorVersion: '0.1.0',
        sourceCommitSha: null,
      },
      completeness: {
        status: 'complete',
        missingRepositories: [],
        permissionGaps: [],
        apiPartials: [],
      },
      integrity: {
        algorithm: 'sha256',
        digest: 'deadbeef',
      },
    };

    const parsed = parseGovernanceHistoryArtifact(input);

    expect(parsed).not.toBeNull();
    expect(parsed?.schemaVersion).toBe(1);
    expect(parsed?.provenance.repositories).toEqual(['hivemoot/colony']);
    expect(parsed?.integrity?.digest).toBe('deadbeef');
  });

  it('serializes integrity payload without integrity field', () => {
    const artifact = buildGovernanceHistoryArtifact({
      generatedAt: '2026-02-08T00:00:00Z',
      snapshots: [snapshot],
      repositories: ['hivemoot/colony'],
      generatedBy: 'web/scripts/generate-data.ts',
      generatorVersion: '0.1.0',
    });

    const serialized = serializeGovernanceHistoryForIntegrity(artifact);
    const decoded = JSON.parse(serialized) as Record<string, unknown>;

    expect(decoded.integrity).toBeUndefined();
    expect(decoded.schemaVersion).toBe(GOVERNANCE_HISTORY_SCHEMA_VERSION);
  });
});
