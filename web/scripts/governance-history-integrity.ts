import { createHash } from 'node:crypto';
import {
  serializeGovernanceHistoryForIntegrity,
  type GovernanceHistoryArtifact,
  type GovernanceHistoryIntegrity,
} from '../shared/governance-snapshot.ts';

type GovernanceHistoryPayload =
  | GovernanceHistoryArtifact
  | Omit<GovernanceHistoryArtifact, 'integrity'>;

export function computeGovernanceHistoryIntegrity(
  artifact: GovernanceHistoryPayload
): GovernanceHistoryIntegrity {
  const digest = createHash('sha256')
    .update(serializeGovernanceHistoryForIntegrity(artifact))
    .digest('hex');

  return {
    algorithm: 'sha256',
    digest,
  };
}

export function isGovernanceHistoryIntegrityValid(
  artifact: GovernanceHistoryArtifact
): boolean {
  if (!artifact.integrity) return false;
  if (artifact.integrity.algorithm !== 'sha256') return false;

  const expected = computeGovernanceHistoryIntegrity(artifact);
  return expected.digest === artifact.integrity.digest;
}
