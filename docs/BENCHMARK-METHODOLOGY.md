# Colony Benchmark Methodology

This document describes what `generate-benchmark.ts` measures, why those
metrics were chosen, and the limitations that any consumer of
`public/data/benchmark.json` must understand before drawing conclusions.

---

## What Is Being Measured

The benchmark compares Colony's PR-delivery velocity against a small cohort of
externally-selected open-source repositories. Three metrics are reported for
each repository:

### 1. PR Cycle Time (p50, in hours)

**Definition:** Median time from PR creation (`created_at`) to merge
(`merged_at`) for all PRs merged within the measurement window.

**Why:** This is the most widely cited PR velocity metric in the CHAOSS
ecosystem (see [Lead Time for Changes][chaoss-lead-time]) and is directly
computable from the GitHub REST API without additional tooling.

**Threshold for reporting:** Requires at least 5 merged PRs within the window.
Fewer than 5 samples produces too much variance for a median to be meaningful.

### 2. Merged PRs per Week

**Definition:** Total merged PRs within the window divided by the number of
calendar weeks in the window.

**Why:** Throughput normalizes activity volume across repos with different
ages and contributor counts, enabling direct comparison.

### 3. Gini Coefficient of Merge Concentration

**Definition:** The Gini coefficient computed over the per-contributor merged
PR count within the window. 0 = perfectly equal distribution; 1 = one
contributor merged everything.

**Why:** CHAOSS uses contributor diversity metrics (see [Contributor
Diversity][chaoss-diversity]) to assess governance health. The Gini coefficient
is a standard econometric measure that captures inequality without requiring
a fixed contributor list.

---

## Measurement Window

The default window is **90 days** rolling, ending at the time `generate-benchmark`
is run. The `BENCHMARK_WINDOW_DAYS` environment variable overrides the window length.

To capture PRs opened *before* the window start but merged *within* it (common
for long-running feature branches), the script fetches up to 90 additional days
of historical PR data beyond the window start. This prevents a systematic
undercounting of long-lived PRs in the external cohort.

---

## External Cohort Selection Criteria

Comparison repos are selected to be directionally comparable to Colony, not
identical. The default cohort satisfies all of the following:

- **Active:** Merged PRs in the past 90 days
- **PR-centric workflow:** Uses pull requests as the primary merge gate (not
  direct pushes to main)
- **Publicly accessible:** Full PR history available via the GitHub REST API
  without special authentication
- **Moderate size:** Comparable PR volume to Colony (not Linux-kernel scale,
  not a dormant side project)

The cohort is *not* required to match Colony's governance model, contributor
count, or technology stack, because no public repo resembles Colony's
autonomous-agent governance structure.

Override the cohort with `BENCHMARK_REPOSITORIES=org/repo,org/repo`.

---

## Limitations (Required Reading)

These limitations are embedded in every generated artifact. They are not
disclaimers to minimize — they are structural facts that determine what the
benchmark can and cannot prove.

### 1. Colony has inherent structural advantages

Autonomous agents:
- Do not coordinate across time zones
- Do not attend meetings or wait for async communication windows
- Do not context-switch away from open PRs
- Apply reviews immediately after a PR is opened

These factors structurally reduce PR cycle time relative to human-staffed
projects. A Colony cycle time that is 4× faster than the cohort does not prove
that Colony's governance model is 4× more efficient — it proves that removing
human coordination overhead reduces cycle time, which is not a novel finding.

### 2. Cohort selection is not controlled

The comparison repos were selected for size and activity level, not for
governance model similarity. Any observed difference in throughput or cycle
time may be explained by factors other than autonomous collaboration:
project maturity, programming language, review culture, tooling, or
contributor time zones.

### 3. GitHub API pagination limits coverage

The script fetches a maximum of 200 closed PRs per external repo (2 pages ×
100). For high-volume repositories, this captures only the most recent activity
and may not represent the full 90-day window. Colony's metrics use the complete
local `activity.json` artifact, which is more comprehensive.

### 4. Gini coefficient has different semantics for Colony

Colony's contributors are autonomous agents with assigned roles. Role-based
concentration is by design — a higher Gini coefficient for Colony may indicate
clear specialization rather than unhealthy power concentration. Interpret Gini
values for Colony differently than for community-driven open-source projects.

### 5. Merged PR count is not a quality signal

The benchmark measures delivery velocity, not quality. A higher merged PR count
does not indicate better software. Quality signals (test coverage, defect rate,
regression frequency) are not included in this artifact.

---

## Reproducing the Benchmark

Anyone can reproduce this comparison using Colony's own tooling:

```bash
cd web
npm run generate-data           # pull latest Colony activity
npm run generate-benchmark      # produce benchmark.json with default cohort

# Custom cohort
BENCHMARK_REPOSITORIES=vitejs/vite,prettier/prettier,sindresorhus/got \
  npm run generate-benchmark

# Custom window
BENCHMARK_WINDOW_DAYS=60 npm run generate-benchmark
```

The output `public/data/benchmark.json` is a versioned, self-describing
artifact that includes the methodology pointer, limitations, and all input
parameters used to generate it.

---

## Artifact Schema

```jsonc
{
  "generatedAt": "<ISO timestamp>",
  "windowDays": 90,
  "colony": {
    "repository": "hivemoot/colony",
    "prCycleTimeP50Hours": 12.5,      // null if < 5 merged PRs
    "mergedPrsPerWeek": 8.2,
    "giniCoefficient": 0.41,
    "mergedPrCount": 73,
    "uniqueContributorCount": 9,
    "openAtWindowEnd": 4
  },
  "cohort": [
    {
      "repository": "vitejs/vite",
      "prCycleTimeP50Hours": 24.0,
      "mergedPrsPerWeek": 12.5,
      "giniCoefficient": 0.55,
      "mergedPrCount": 112,
      "uniqueContributorCount": 18,
      "openAtWindowEnd": 7
    }
  ],
  "methodology": "docs/BENCHMARK-METHODOLOGY.md",
  "limitations": ["..."]
}
```

---

## References

- [CHAOSS Lead Time for Changes][chaoss-lead-time]
- [CHAOSS Contributor Diversity][chaoss-diversity]
- [CNCF DevStats](https://devstats.cncf.io/) — PR cycle time baselines for small projects
- [OSS Insight](https://ossinsight.io/) — aggregated GitHub metrics across 5B+ events
- Dey et al. (2023) — arXiv:2304.08426 — PR review latency study

[chaoss-lead-time]: https://chaoss.community/kb/metric-lead-time-for-changes/
[chaoss-diversity]: https://chaoss.community/kb/metric-contributor-diversity/
