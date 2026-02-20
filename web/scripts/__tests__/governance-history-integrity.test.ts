import { describe, it, expect } from 'vitest';
import type {
  GovernanceHistoryArtifact,
  GovernanceSnapshot,
} from '../../shared/governance-snapshot';
import {
  computeGovernanceHistoryIntegrity,
  isGovernanceHistoryIntegrityValid,
} from '../governance-history-integrity';

function makeSnapshot(timestamp: string, healthScore: number): GovernanceSnapshot {
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
  snapshots: GovernanceSnapshot[] = [],
  overrides: Partial<GovernanceHistoryArtifact> = {}
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
      status: 'complete',
      missingRepositories: [],
      permissionGaps: [],
      apiPartials: [],
    },
    integrity: null,
    ...overrides,
  };

  return {
    ...base,
    integrity: computeGovernanceHistoryIntegrity(base),
  };
}

describe('computeGovernanceHistoryIntegrity', () => {
  it('returns a sha256 digest', () => {
    const artifact = makeArtifact([makeSnapshot('2026-02-10T00:00:00Z', 60)]);
    expect(artifact.integrity?.algorithm).toBe('sha256');
    expect(artifact.integrity?.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same digest regardless of the integrity field value', () => {
    const base: GovernanceHistoryArtifact = {
      schemaVersion: 1,
      generatedAt: '2026-02-11T00:00:00Z',
      snapshots: [makeSnapshot('2026-02-10T00:00:00Z', 60)],
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
      integrity: null,
    };

    const digestWithNull = computeGovernanceHistoryIntegrity(base).digest;
    const digestWithSomeValue = computeGovernanceHistoryIntegrity({
      ...base,
      integrity: { algorithm: 'sha256', digest: '0'.repeat(64) },
    }).digest;

    expect(digestWithNull).toBe(digestWithSomeValue);
  });

  it('produces different digests for different content', () => {
    const a = computeGovernanceHistoryIntegrity(
      makeArtifact([makeSnapshot('2026-02-10T00:00:00Z', 60)])
    );
    const b = computeGovernanceHistoryIntegrity(
      makeArtifact([makeSnapshot('2026-02-10T00:00:00Z', 80)])
    );

    expect(a.digest).not.toBe(b.digest);
  });

  it('produces a stable digest for an empty snapshots array', () => {
    const first = computeGovernanceHistoryIntegrity(makeArtifact([]));
    const second = computeGovernanceHistoryIntegrity(makeArtifact([]));

    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('isGovernanceHistoryIntegrityValid', () => {
  it('returns true for a matching digest', () => {
    const artifact = makeArtifact([makeSnapshot('2026-02-10T00:00:00Z', 60)]);

    expect(isGovernanceHistoryIntegrityValid(artifact)).toBe(true);
  });

  it('returns false when integrity is null', () => {
    const artifact = makeArtifact([makeSnapshot('2026-02-10T00:00:00Z', 60)]);
    artifact.integrity = null;

    expect(isGovernanceHistoryIntegrityValid(artifact)).toBe(false);
  });

  it('returns false when algorithm is not sha256', () => {
    const artifact = makeArtifact([makeSnapshot('2026-02-10T00:00:00Z', 60)]);
    // Bypass the type to simulate an unsupported algorithm from an older schema.
    artifact.integrity = {
      algorithm: 'sha256' as const,
      digest: artifact.integrity!.digest,
    };
    // Manually override algorithm on the raw object.
    (artifact.integrity as { algorithm: string }).algorithm = 'md5';

    expect(isGovernanceHistoryIntegrityValid(artifact)).toBe(false);
  });

  it('returns false for a tampered digest', () => {
    const artifact = makeArtifact([makeSnapshot('2026-02-10T00:00:00Z', 60)]);
    artifact.integrity = {
      algorithm: 'sha256',
      digest: '0'.repeat(64),
    };

    expect(isGovernanceHistoryIntegrityValid(artifact)).toBe(false);
  });

  it('returns false when snapshot content is modified after sealing', () => {
    const artifact = makeArtifact([makeSnapshot('2026-02-10T00:00:00Z', 60)]);
    // Tamper with content after integrity was computed.
    artifact.snapshots[0]!.healthScore = 99;

    expect(isGovernanceHistoryIntegrityValid(artifact)).toBe(false);
  });
});
