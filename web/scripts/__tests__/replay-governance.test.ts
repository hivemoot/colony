import { describe, it, expect } from 'vitest';
import type {
  GovernanceHistoryArtifact,
  GovernanceSnapshot,
} from '../../shared/governance-snapshot';
import {
  computeGovernanceHistoryIntegrity,
  isGovernanceHistoryIntegrityValid,
} from '../governance-history-integrity';
import {
  formatMissingHistoryFileMessage,
  parseReplayArgs,
  replayFromArtifact,
  summarizeGovernanceReplay,
  summarizeNumericValues,
} from '../replay-governance';

function makeSnapshot(
  timestamp: string,
  healthScore: number
): GovernanceSnapshot {
  return {
    timestamp,
    healthScore,
    participation: 15,
    pipelineFlow: 15,
    followThrough: 15,
    consensusQuality: 15,
    activeProposals: 4,
    totalProposals: 12,
    activeAgents: 3,
    proposalVelocity: 0.4,
  };
}

function makeArtifact(
  snapshots: GovernanceSnapshot[],
  completeness: GovernanceHistoryArtifact['completeness']['status'] = 'complete'
): GovernanceHistoryArtifact {
  const base: GovernanceHistoryArtifact = {
    schemaVersion: 1,
    generatedAt: '2026-02-11T00:00:00Z',
    snapshots,
    provenance: {
      repositories: ['hivemoot/colony'],
      generatedBy: 'web/scripts/generate-data.ts',
      generatorVersion: '0.1.0',
      sourceCommitSha: null,
    },
    completeness: {
      status: completeness,
      missingRepositories: [],
      permissionGaps: [],
      apiPartials: [],
    },
    integrity: null,
  };

  return {
    ...base,
    integrity: computeGovernanceHistoryIntegrity(base),
  };
}

describe('governance-history-integrity', () => {
  it('validates matching integrity digest', () => {
    const artifact = makeArtifact([makeSnapshot('2026-02-10T00:00:00Z', 60)]);

    expect(isGovernanceHistoryIntegrityValid(artifact)).toBe(true);
  });

  it('detects digest mismatch', () => {
    const artifact = makeArtifact([makeSnapshot('2026-02-10T00:00:00Z', 60)]);
    artifact.integrity = {
      algorithm: 'sha256',
      digest: '0'.repeat(64),
    };

    expect(isGovernanceHistoryIntegrityValid(artifact)).toBe(false);
  });
});

describe('parseReplayArgs', () => {
  it('parses supported flags', () => {
    const args = parseReplayArgs([
      '--file=/tmp/history.json',
      '--from=2026-02-01T00:00:00Z',
      '--to=2026-02-10T00:00:00Z',
      '--json',
    ]);

    expect(args.file).toBe('/tmp/history.json');
    expect(args.from).toBe('2026-02-01T00:00:00Z');
    expect(args.to).toBe('2026-02-10T00:00:00Z');
    expect(args.json).toBe(true);
  });

  it('throws on unsupported flags', () => {
    expect(() => parseReplayArgs(['--wat'])).toThrow(/Unknown argument/);
  });
});

describe('formatMissingHistoryFileMessage', () => {
  it('includes setup guidance for the default history path', () => {
    const message = formatMissingHistoryFileMessage(parseReplayArgs([]).file);

    expect(message).toContain('History file not found');
    expect(message).toContain('npm run generate-data');
    expect(message).toContain('npm run replay-governance -- --json');
  });

  it('guides troubleshooting for custom --file paths', () => {
    const message = formatMissingHistoryFileMessage('/tmp/custom-history.json');

    expect(message).toContain('/tmp/custom-history.json');
    expect(message).toContain('Verify --file');
  });
});

describe('summarizeNumericValues', () => {
  it('returns null for an empty array', () => {
    expect(summarizeNumericValues([])).toBeNull();
  });

  it('returns null when all values are non-finite', () => {
    expect(
      summarizeNumericValues([null, undefined, NaN, Infinity, -Infinity])
    ).toBeNull();
  });

  it('computes correct statistics for a single value', () => {
    const result = summarizeNumericValues([5]);
    expect(result).toEqual({
      first: 5,
      last: 5,
      delta: 0,
      min: 5,
      max: 5,
      average: 5,
    });
  });

  it('computes correct statistics for multiple values', () => {
    const result = summarizeNumericValues([10, 20, 30]);
    expect(result).toEqual({
      first: 10,
      last: 30,
      delta: 20,
      min: 10,
      max: 30,
      average: 20,
    });
  });

  it('filters out null and non-finite values before computing', () => {
    const result = summarizeNumericValues([10, null, NaN, Infinity, 20]);
    expect(result).toEqual({
      first: 10,
      last: 20,
      delta: 10,
      min: 10,
      max: 20,
      average: 15,
    });
  });

  it('rounds average to two decimal places', () => {
    const result = summarizeNumericValues([1, 2, 3]);
    expect(result?.average).toBe(2);
    const result2 = summarizeNumericValues([1, 2]);
    expect(result2?.average).toBe(1.5);
    const result3 = summarizeNumericValues([1, 1, 2]);
    expect(result3?.average).toBe(1.33);
  });
});

describe('summarizeGovernanceReplay', () => {
  const snapshots = [
    makeSnapshot('2026-02-01T00:00:00Z', 50),
    makeSnapshot('2026-02-02T00:00:00Z', 70),
    makeSnapshot('2026-02-03T00:00:00Z', 80),
  ];

  it('computes summary across full history', () => {
    const summary = summarizeGovernanceReplay(snapshots, null, null);

    expect(summary.points).toBe(3);
    expect(summary.firstHealth).toBe(50);
    expect(summary.lastHealth).toBe(80);
    expect(summary.deltaHealth).toBe(30);
    expect(summary.averageHealth).toBeCloseTo(66.67, 2);
  });

  it('filters replay window', () => {
    const summary = summarizeGovernanceReplay(
      snapshots,
      '2026-02-02T00:00:00Z',
      '2026-02-03T00:00:00Z'
    );

    expect(summary.points).toBe(2);
    expect(summary.firstHealth).toBe(70);
    expect(summary.lastHealth).toBe(80);
  });

  it('returns null subMetrics for empty window', () => {
    const summary = summarizeGovernanceReplay([], null, null);
    expect(summary.subMetrics).toBeNull();
  });

  it('includes subMetrics in summary for non-empty window', () => {
    const summary = summarizeGovernanceReplay(snapshots, null, null);
    expect(summary.subMetrics).not.toBeNull();
    expect(summary.subMetrics?.participation).not.toBeNull();
    expect(summary.subMetrics?.pipelineFlow).not.toBeNull();
    expect(summary.subMetrics?.followThrough).not.toBeNull();
    expect(summary.subMetrics?.consensusQuality).not.toBeNull();
    expect(summary.subMetrics?.activeAgents).not.toBeNull();
    expect(summary.subMetrics?.proposalVelocity).not.toBeNull();
  });

  it('sub-metric values match snapshot data', () => {
    // makeSnapshot sets participation=15, pipelineFlow=15 for all snapshots
    const summary = summarizeGovernanceReplay(snapshots, null, null);
    expect(summary.subMetrics?.participation).toEqual({
      first: 15,
      last: 15,
      delta: 0,
      min: 15,
      max: 15,
      average: 15,
    });
  });

  it('filters null proposalVelocity before sub-metric summarization', () => {
    const snapshotsWithNullVelocity: GovernanceSnapshot[] = [
      { ...makeSnapshot('2026-02-01T00:00:00Z', 50), proposalVelocity: null },
      { ...makeSnapshot('2026-02-02T00:00:00Z', 60), proposalVelocity: 0.5 },
      { ...makeSnapshot('2026-02-03T00:00:00Z', 70), proposalVelocity: null },
    ];
    const summary = summarizeGovernanceReplay(
      snapshotsWithNullVelocity,
      null,
      null
    );
    // Only the one finite value (0.5) should survive
    expect(summary.subMetrics?.proposalVelocity).toEqual({
      first: 0.5,
      last: 0.5,
      delta: 0,
      min: 0.5,
      max: 0.5,
      average: 0.5,
    });
  });

  it('returns null proposalVelocity summary when all velocities are null', () => {
    const allNullVelocity: GovernanceSnapshot[] = [
      { ...makeSnapshot('2026-02-01T00:00:00Z', 50), proposalVelocity: null },
      { ...makeSnapshot('2026-02-02T00:00:00Z', 60), proposalVelocity: null },
    ];
    const summary = summarizeGovernanceReplay(allNullVelocity, null, null);
    expect(summary.subMetrics?.proposalVelocity).toBeNull();
  });
});

describe('replayFromArtifact', () => {
  it('marks integrity as partial when completeness is partial', () => {
    const artifact = makeArtifact(
      [makeSnapshot('2026-02-10T00:00:00Z', 60)],
      'partial'
    );

    const replay = replayFromArtifact(artifact, {
      file: '/tmp/unused.json',
      from: null,
      to: null,
      json: true,
    });

    expect(replay.integrity).toBe('partial');
  });
});
