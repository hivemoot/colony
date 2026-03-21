import { describe, expect, it } from 'vitest';
import {
  buildReport,
  formatReport,
  parseArgs,
  LINEAR_B_2025,
  type BenchmarkArtifact,
} from '../check-benchmarks';

const BASE_WINDOW = {
  start: '2025-12-01T00:00:00Z',
  end: '2026-03-01T00:00:00Z',
  days: 90,
};

const BASE_METRICS = {
  openedPrs: 100,
  mergedPrs: 85,
  openPrs: 10,
  staleOpenPrs: 2,
  activeContributors: 8,
  prCycleTimeP50Hours: 18.5,
  mergeRate: 0.85,
  staleOpenPrShare: 0.2,
};

function makeArtifact(
  overrides?: Partial<BenchmarkArtifact>
): BenchmarkArtifact {
  return {
    generatedAt: '2026-03-01T12:00:00Z',
    methodologyPath: 'docs/BENCHMARK-METHODOLOGY.md',
    staleOpenThresholdDays: 7,
    colony: {
      repository: 'hivemoot/colony',
      source: 'activity-json',
      window: BASE_WINDOW,
      metrics: BASE_METRICS,
    },
    selfComparison: {
      baselineLabel: 'first 30d',
      current: {
        repository: 'hivemoot/colony',
        source: 'activity-json',
        window: {
          start: '2026-01-01T00:00:00Z',
          end: '2026-03-01T00:00:00Z',
          days: 59,
        },
        metrics: { ...BASE_METRICS, prCycleTimeP50Hours: 18.5 },
      },
      baseline: {
        repository: 'hivemoot/colony',
        source: 'activity-json',
        window: {
          start: '2025-12-01T00:00:00Z',
          end: '2025-12-31T00:00:00Z',
          days: 30,
        },
        metrics: {
          ...BASE_METRICS,
          prCycleTimeP50Hours: 24.0,
          mergedPrs: 30,
          openedPrs: 35,
        },
      },
    },
    cohort: [
      {
        repository: 'chaoss/grimoirelab',
        source: 'github-api',
        window: BASE_WINDOW,
        metrics: {
          ...BASE_METRICS,
          prCycleTimeP50Hours: 96,
          mergeRate: 0.7,
          activeContributors: 12,
        },
      },
    ],
    notes: ['GitHub API data for cohort repos is approximate.'],
    ...overrides,
  };
}

describe('parseArgs', () => {
  it('defaults to no flags', () => {
    const opts = parseArgs([]);
    expect(opts.json).toBe(false);
    expect(opts.compare).toBe(false);
  });

  it('parses --json', () => {
    expect(parseArgs(['--json']).json).toBe(true);
  });

  it('parses --compare', () => {
    expect(parseArgs(['--compare']).compare).toBe(true);
  });

  it('parses both flags together', () => {
    const opts = parseArgs(['--compare', '--json']);
    expect(opts.json).toBe(true);
    expect(opts.compare).toBe(true);
  });
});

describe('buildReport', () => {
  it('includes colony, selfComparison, cohort, notes without --compare', () => {
    const artifact = makeArtifact();
    const report = buildReport(artifact, { compare: false });

    expect(report.colony.repository).toBe('hivemoot/colony');
    expect(report.cohort).toHaveLength(1);
    expect(report.notes).toHaveLength(1);
    expect(report.externalReferences).toBeUndefined();
  });

  it('adds externalReferences with --compare', () => {
    const artifact = makeArtifact();
    const report = buildReport(artifact, { compare: true });

    expect(report.externalReferences).toBeDefined();
    expect(report.externalReferences).toHaveLength(1);
    const refs = report.externalReferences ?? [];
    const ref = refs[0];
    expect(ref.metric).toBe('prCycleTimeP50Hours');
    expect(ref.eliteThresholdHours).toBe(LINEAR_B_2025.eliteThresholdHours);
    expect(ref.medianHours).toBe(LINEAR_B_2025.medianHours);
    expect(ref.source).toBe(LINEAR_B_2025.source);
    expect(ref.sourceUrl).toBe(LINEAR_B_2025.sourceUrl);
    expect(ref.sampleSize).toBe(LINEAR_B_2025.sampleSize);
    expect(ref.year).toBe(LINEAR_B_2025.year);
    expect(ref.caveat).toContain('24/7');
  });

  it('externalReferences has only prCycleTimeP50Hours — no other metrics', () => {
    const artifact = makeArtifact();
    const report = buildReport(artifact, { compare: true });
    const metrics = (report.externalReferences ?? []).map((r) => r.metric);
    expect(metrics).toEqual(['prCycleTimeP50Hours']);
  });
});

describe('formatReport', () => {
  it('includes colony metrics section', () => {
    const artifact = makeArtifact();
    const report = buildReport(artifact, { compare: false });
    const output = formatReport(report, { compare: false });

    expect(output).toContain('Colony Benchmark Report');
    expect(output).toContain('hivemoot/colony');
    expect(output).toContain('18.5h');
    expect(output).toContain('85.0%');
  });

  it('includes self-comparison section', () => {
    const artifact = makeArtifact();
    const report = buildReport(artifact, { compare: false });
    const output = formatReport(report, { compare: false });

    expect(output).toContain('Self-comparison');
    expect(output).toContain('first 30d');
    // Should show downward arrow because 18.5 < 24
    expect(output).toContain('↓');
  });

  it('includes cohort table when cohort is non-empty', () => {
    const artifact = makeArtifact();
    const report = buildReport(artifact, { compare: false });
    const output = formatReport(report, { compare: false });

    expect(output).toContain('Cohort comparison');
    expect(output).toContain('chaoss/grimoirelab');
    expect(output).toContain('4.0d'); // 96h formatted as days
  });

  it('omits cohort section when cohort is empty', () => {
    const artifact = makeArtifact({ cohort: [] });
    const report = buildReport(artifact, { compare: false });
    const output = formatReport(report, { compare: false });

    expect(output).not.toContain('Cohort comparison');
  });

  it('includes external reference section with --compare', () => {
    const artifact = makeArtifact();
    const report = buildReport(artifact, { compare: true });
    const output = formatReport(report, { compare: true });

    expect(output).toContain('External reference');
    expect(output).toContain('LinearB 2025');
    expect(output).toContain('Comparability note');
    expect(output).toContain('24/7');
    expect(output).toContain('26.0h'); // elite threshold
    expect(output).toContain('7.0d'); // 168h median
  });

  it('omits external reference section without --compare', () => {
    const artifact = makeArtifact();
    const report = buildReport(artifact, { compare: false });
    const output = formatReport(report, { compare: false });

    expect(output).not.toContain('External reference');
    expect(output).not.toContain('LinearB');
  });

  it('includes notes section', () => {
    const artifact = makeArtifact();
    const report = buildReport(artifact, { compare: false });
    const output = formatReport(report, { compare: false });

    expect(output).toContain('Notes');
    expect(output).toContain(
      'GitHub API data for cohort repos is approximate.'
    );
  });

  it('omits notes section when notes is empty', () => {
    const artifact = makeArtifact({ notes: [] });
    const report = buildReport(artifact, { compare: false });
    const output = formatReport(report, { compare: false });

    expect(output).not.toContain('Notes');
  });

  it('handles null cycle time gracefully', () => {
    const artifact = makeArtifact({
      colony: {
        repository: 'hivemoot/colony',
        source: 'activity-json',
        window: BASE_WINDOW,
        metrics: { ...BASE_METRICS, prCycleTimeP50Hours: null },
      },
    });
    const report = buildReport(artifact, { compare: false });
    const output = formatReport(report, { compare: false });

    expect(output).toContain('n/a');
  });

  it('shows upward arrow when current cycle time is worse than baseline', () => {
    const artifact = makeArtifact({
      selfComparison: {
        baselineLabel: 'first 30d',
        current: {
          repository: 'hivemoot/colony',
          source: 'activity-json',
          window: BASE_WINDOW,
          metrics: { ...BASE_METRICS, prCycleTimeP50Hours: 30 },
        },
        baseline: {
          repository: 'hivemoot/colony',
          source: 'activity-json',
          window: BASE_WINDOW,
          metrics: { ...BASE_METRICS, prCycleTimeP50Hours: 20 },
        },
      },
    });
    const report = buildReport(artifact, { compare: false });
    const output = formatReport(report, { compare: false });
    expect(output).toContain('↑');
  });

  it('shows stable arrow when current equals baseline', () => {
    const artifact = makeArtifact({
      selfComparison: {
        baselineLabel: 'first 30d',
        current: {
          repository: 'hivemoot/colony',
          source: 'activity-json',
          window: BASE_WINDOW,
          metrics: { ...BASE_METRICS, prCycleTimeP50Hours: 20 },
        },
        baseline: {
          repository: 'hivemoot/colony',
          source: 'activity-json',
          window: BASE_WINDOW,
          metrics: { ...BASE_METRICS, prCycleTimeP50Hours: 20 },
        },
      },
    });
    const report = buildReport(artifact, { compare: false });
    const output = formatReport(report, { compare: false });
    expect(output).toContain('→');
  });
});

describe('LINEAR_B_2025', () => {
  it('has expected structure', () => {
    expect(LINEAR_B_2025.eliteThresholdHours).toBe(26);
    expect(LINEAR_B_2025.medianHours).toBe(168);
    expect(LINEAR_B_2025.year).toBe(2025);
    expect(LINEAR_B_2025.sourceUrl).toContain('linearb.io');
    expect(LINEAR_B_2025.sampleSize).toContain('6.1M');
    expect(LINEAR_B_2025.caveat).toContain('24/7');
  });
});
