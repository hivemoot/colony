/**
 * CHAOSS-compatible metrics snapshot builder.
 *
 * Maps Colony's internal governance metrics to CHAOSS metric identifiers,
 * producing a stable JSON shape that external tools (GrimoireLab, Augur,
 * CLOMonitor, researchers) can consume without parsing Colony-specific formats.
 *
 * CHAOSS specs referenced:
 *   https://chaoss.community/kb/metric-change-request-duration/
 *   https://chaoss.community/kb/metric-change-requests-accepted/
 *   https://chaoss.community/kb/metric-contributor-absence-factor/
 *   https://chaoss.community/kb/metric-change-request-reviews/
 *
 * Usage (called from generate-data.ts):
 *   const snapshot = buildChaossSnapshot(data, source);
 */

import type { ActivityData } from '../shared/types';
import {
  computePrCycleTime,
  computeRoleDiversity,
  computeContestedRate,
  computeCrossRoleReviewRate,
  computeDataWindowDays,
} from './check-governance-health';

// ──────────────────────────────────────────────
// Output type
// ──────────────────────────────────────────────

export interface ChaossSnapshot {
  schemaVersion: '1';
  computedAt: string;
  /** Source repository URL for attribution and reproducibility */
  source: string;
  /** Span of the proposal dataset used for role/decision metrics (days) */
  dataWindowDays: number;
  metrics: {
    changeRequestDuration: {
      'x-chaoss-metric': 'change-request-duration';
      'x-chaoss-spec': string;
      scope: string;
      /** Median PR open-to-merge time in days, or null if no data */
      p50Days: number | null;
      /** 95th-percentile PR open-to-merge time in days, or null if no data */
      p95Days: number | null;
      sampleSize: number;
    };
    changeRequestsAccepted: {
      'x-chaoss-metric': 'change-requests-accepted';
      'x-chaoss-spec': string;
      /** Merged PRs in the activity dataset */
      count: number;
      /** Window covered by the activity dataset (same as dataWindowDays) */
      windowDays: number;
    };
    contributorConcentration: {
      'x-chaoss-metric': 'contributor-absence-factor';
      'x-chaoss-note': string;
      'x-chaoss-spec': string;
      /** Gini coefficient over proposal counts per role (0=equal, 1=concentrated) */
      giniCoefficient: number;
      uniqueContributorRoles: number;
      /** Fraction of proposals authored by the most-active role (0–1) */
      topRoleShare: number;
    };
    changeRequestReviews: {
      'x-chaoss-metric': 'change-request-reviews';
      'x-chaoss-spec': string;
      'x-chaoss-note': string;
      /** Fraction of reviews where reviewer role differs from PR author role (0–1) */
      crossRoleReviewRate: number;
      sampleSize: number;
    };
    contestedDecisionRate: {
      'x-chaoss-metric': null;
      'x-colony-metric': 'contested-decision-rate';
      note: string;
      rate: number;
      contestedCount: number;
      totalVoted: number;
    };
  };
}

// ──────────────────────────────────────────────
// Builder
// ──────────────────────────────────────────────

const MINUTES_PER_DAY = 60 * 24;

function minutesToDays(minutes: number | null): number | null {
  if (minutes === null) return null;
  // Round to 2 decimal places for readability
  return Math.round((minutes / MINUTES_PER_DAY) * 100) / 100;
}

export function buildChaossSnapshot(
  data: ActivityData,
  source: string
): ChaossSnapshot {
  const cycleTime = computePrCycleTime(data.pullRequests);
  const roleDiversity = computeRoleDiversity(data.proposals);
  const contestedRate = computeContestedRate(data.proposals);
  const crossRoleReview = computeCrossRoleReviewRate(
    data.pullRequests,
    data.comments
  );
  const dataWindowDays = computeDataWindowDays(data.proposals);

  const mergedPRCount = data.pullRequests.filter(
    (pr) => pr.state === 'merged'
  ).length;

  return {
    schemaVersion: '1',
    computedAt: data.generatedAt,
    source,
    dataWindowDays,
    metrics: {
      changeRequestDuration: {
        'x-chaoss-metric': 'change-request-duration',
        'x-chaoss-spec':
          'https://chaoss.community/kb/metric-change-request-duration/',
        scope: 'PR open-to-merge (excludes coding time and deploy)',
        p50Days: minutesToDays(cycleTime.p50),
        p95Days: minutesToDays(cycleTime.p95),
        sampleSize: cycleTime.sampleSize,
      },
      changeRequestsAccepted: {
        'x-chaoss-metric': 'change-requests-accepted',
        'x-chaoss-spec':
          'https://chaoss.community/kb/metric-change-requests-accepted/',
        count: mergedPRCount,
        windowDays: dataWindowDays,
      },
      contributorConcentration: {
        'x-chaoss-metric': 'contributor-absence-factor',
        'x-chaoss-note':
          'Approximation: Colony measures role concentration (Gini), not contributor absence. Scope differs from CHAOSS spec.',
        'x-chaoss-spec':
          'https://chaoss.community/kb/metric-contributor-absence-factor/',
        giniCoefficient: Math.round(roleDiversity.giniIndex * 10000) / 10000,
        uniqueContributorRoles: roleDiversity.uniqueRoles,
        topRoleShare: Math.round(roleDiversity.topRoleShare * 10000) / 10000,
      },
      changeRequestReviews: {
        'x-chaoss-metric': 'change-request-reviews',
        'x-chaoss-spec':
          'https://chaoss.community/kb/metric-change-request-reviews/',
        'x-chaoss-note':
          'Approximation: Colony measures cross-role review fraction, not raw review count per change request. Scope differs from CHAOSS spec.',
        crossRoleReviewRate: Math.round(crossRoleReview.rate * 10000) / 10000,
        sampleSize: crossRoleReview.totalReviews,
      },
      contestedDecisionRate: {
        'x-chaoss-metric': null,
        'x-colony-metric': 'contested-decision-rate',
        note: 'Colony-native: proposals with >= 1 opposing vote / total voted proposals',
        rate: Math.round(contestedRate.rate * 10000) / 10000,
        contestedCount: contestedRate.contestedCount,
        totalVoted: contestedRate.totalVoted,
      },
    },
  };
}
