import { describe, expect, it, vi } from 'vitest';
import {
  buildOutreachReport,
  dedupePullRequestRefs,
  extractPullRequestRefsFromText,
  normalizePullState,
  parsePullRequestRef,
} from '../external-outreach-metrics';

describe('parsePullRequestRef', () => {
  it('parses a valid owner/repo#number ref', () => {
    expect(parsePullRequestRef('e2b-dev/awesome-ai-agents#274')).toEqual({
      repo: 'e2b-dev/awesome-ai-agents',
      number: 274,
    });
  });

  it('rejects malformed refs', () => {
    expect(parsePullRequestRef('e2b-dev/awesome-ai-agents')).toBeNull();
    expect(parsePullRequestRef('e2b-dev/awesome-ai-agents#0')).toBeNull();
    expect(
      parsePullRequestRef('https://github.com/e2b-dev/x/pull/1')
    ).toBeNull();
  });
});

describe('normalizePullState', () => {
  it('returns merged when merged_at is present', () => {
    expect(normalizePullState('open', '2026-02-17T00:00:00Z')).toBe('merged');
  });

  it('normalizes open/closed and falls back to unknown', () => {
    expect(normalizePullState('open', null)).toBe('open');
    expect(normalizePullState('closed', null)).toBe('closed');
    expect(normalizePullState(undefined, null)).toBe('unknown');
  });
});

describe('extractPullRequestRefsFromText', () => {
  it('extracts PR refs from URLs and owner/repo#number text', () => {
    const refs = extractPullRequestRefsFromText(
      [
        'Merged: https://github.com/e2b-dev/awesome-ai-agents/pull/274',
        'Queued: jim-schwoebel/awesome_ai_agents#42',
        'Ignore issue links like https://github.com/e2b-dev/awesome-ai-agents/issues/12',
      ].join('\n')
    );

    expect(refs).toEqual([
      { repo: 'e2b-dev/awesome-ai-agents', number: 274 },
      { repo: 'jim-schwoebel/awesome_ai_agents', number: 42 },
    ]);
  });
});

describe('dedupePullRequestRefs', () => {
  it('deduplicates refs case-insensitively while keeping first-seen order', () => {
    const refs = dedupePullRequestRefs([
      { repo: 'e2b-dev/awesome-ai-agents', number: 274 },
      { repo: 'E2B-DEV/awesome-ai-agents', number: 274 },
      { repo: 'jim-schwoebel/awesome_ai_agents', number: 42 },
    ]);

    expect(refs).toEqual([
      { repo: 'e2b-dev/awesome-ai-agents', number: 274 },
      { repo: 'jim-schwoebel/awesome_ai_agents', number: 42 },
    ]);
  });
});

describe('buildOutreachReport', () => {
  it('computes star delta and outreach totals', () => {
    const now = new Date('2026-02-18T00:00:00Z');
    const clock = vi.useFakeTimers();
    clock.setSystemTime(now);

    const report = buildOutreachReport('hivemoot/colony', 5, 2, [
      {
        ref: 'e2b-dev/awesome-ai-agents#274',
        title: 'Add Hivemoot',
        url: 'https://github.com/e2b-dev/awesome-ai-agents/pull/274',
        state: 'open',
      },
      {
        ref: 'jim-schwoebel/awesome_ai_agents#42',
        title: 'Add Hivemoot',
        url: 'https://github.com/jim-schwoebel/awesome_ai_agents/pull/42',
        state: 'merged',
      },
      {
        ref: 'Jenqyang/Awesome-AI-Agents#52',
        title: 'Add Hivemoot',
        url: 'https://github.com/Jenqyang/Awesome-AI-Agents/pull/52',
        state: 'closed',
      },
    ]);

    expect(report.generatedAt).toBe('2026-02-18T00:00:00.000Z');
    expect(report.stars.current).toBe(5);
    expect(report.stars.deltaSinceBaseline).toBe(3);
    expect(report.outreach.acceptedLinks).toBe(1);
    expect(report.outreach.openSubmissions).toBe(1);
    expect(report.outreach.rejectedOrClosed).toBe(1);

    clock.useRealTimers();
  });

  it('keeps unknown PRs out of accepted/open/closed totals', () => {
    const report = buildOutreachReport('hivemoot/colony', 2, null, [
      {
        ref: 'owner/repo#1',
        title: '(failed to load)',
        url: 'https://github.com/owner/repo/pull/1',
        state: 'unknown',
        error: 'gh api failed',
      },
    ]);

    expect(report.outreach.acceptedLinks).toBe(0);
    expect(report.outreach.openSubmissions).toBe(0);
    expect(report.outreach.rejectedOrClosed).toBe(0);
    expect(report.outreach.trackedPullRequests[0]?.error).toContain(
      'gh api failed'
    );
  });
});
