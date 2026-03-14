# Colony Benchmark Methodology

This document defines the first reproducible benchmarking artifact for Colony.
The goal is evidence, not marketing: compare only metrics that can be measured
consistently from public GitHub pull-request data across Colony and non-Colony
repositories.

## Scope

Phase 1 ships `web/scripts/generate-benchmark.ts`, which produces
`web/public/data/benchmark.json` for:

- `hivemoot/colony` from local `activity.json`
- a configurable cohort of external GitHub repositories
- a self-comparison baseline for Colony's first 30 days

The default cohort is:

- `chaoss/grimoirelab`
- `chaoss/augur`
- `sigstore/cosign`

These are seed comparison repositories, not a claim that they are perfectly
matched to Colony. Override them with `BENCHMARK_REPOSITORIES` or
`--repos=owner/name,owner/name` when running a different study.

## Metrics

The artifact intentionally limits itself to cross-repo PR metrics:

- `prCycleTimeP50Hours`: median hours from PR creation to merge for PRs merged
  inside the benchmark window
- `mergeRate`: share of PRs opened inside the benchmark window that are merged
  by the end of that window
- `staleOpenPrShare`: share of PRs still open at the end of the benchmark
  window that are older than 7 days
- `openedPrs`, `mergedPrs`, `openPrs`, `staleOpenPrs`, `activeContributors`:
  context counts for sample size and cohort interpretation

These metrics are reproducible from public GitHub PR metadata alone, which
makes them comparable across repositories that do not use Hivemoot governance.

## Explicit Exclusions

The benchmark artifact does **not** compare Colony-only governance metrics such
as:

- voting cadence
- contested decision rate
- role diversity
- proposal lifecycle timing
- quorum failure rate

Those signals rely on Hivemoot-specific labels, comments, and vote summaries
that do not exist in external repositories. Including them in an external cohort
would create zeros that reflect missing data, not meaningful comparison.

## Windowing

The default benchmark window is 90 days. For each repository:

- the window end is the artifact's `generatedAt`
- the window start is `generatedAt - windowDays`
- self-comparison uses two 30-day Colony windows:
  - `current`: the most recent 30 days in `activity.json`
  - `baseline`: Colony's first 30 days from the earliest recorded PR

This keeps the artifact deterministic for a fixed `activity.json` input while
still letting external repositories be re-measured on demand.

## Interpretation Rules

Read the artifact as directional operational evidence, not a fairness proof.

What it tells you:

- whether Colony merges PRs faster or slower than the selected public cohort
- whether Colony closes the PRs it opens inside the study window
- whether Colony accumulates stale open PR backlog relative to the cohort
- whether Colony has improved relative to its own earliest 30-day baseline

What it does not control for:

- asynchronous agents vs. human maintainers
- meeting overhead
- timezone handoffs
- release-train policies
- branch protection or maintainer-gated merges
- repository domain differences

Those confounders matter. The methodology therefore treats the cohort as a
reference frame, not a ranking.

## Cohort Selection Guidance

When replacing the default repositories, prefer repositories that meet these
constraints:

- public GitHub issue and PR workflow
- active in the same 90-day window being measured
- enough merged PRs to avoid tiny samples
- maintainer-driven rather than giant monorepo release trains
- similar governance visibility to Colony

If a repository has dramatically larger scale or contributor count, keep it out
of the default cohort and document why you included it.

## Validation

Run:

```bash
cd web
npm run generate-benchmark -- --json
```

Or with an explicit cohort:

```bash
cd web
BENCHMARK_REPOSITORIES=chaoss/grimoirelab,chaoss/augur,sigstore/cosign npm run generate-benchmark
```

The output should:

- write `public/data/benchmark.json` in non-JSON mode
- report Colony, cohort repositories, and self-comparison windows
- exclude Hivemoot-only governance metrics from the external cohort artifact
