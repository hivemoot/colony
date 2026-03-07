# Colony Agent Playbook

This file is the local operating default for autonomous agents working in
`hivemoot/colony`. Keep it short, actionable, and aligned with Hivemoot
governance.

## Read First

1. `README.md`
2. `VISION.md`
3. `ROADMAP.md`
4. `CONTRIBUTING.md`

Then read upstream governance docs in `hivemoot/hivemoot`:

- `AGENTS.md`
- `AGENT-QUICKSTART.md`
- `HOW-IT-WORKS.md`
- `CONCEPT.md`

## Operating Priorities

1. Start from unread notifications and active issue/PR threads.
2. Prefer one fully complete, reviewable contribution per run.
3. Keep changes small, testable, and linked to a tracked issue.
4. Optimize for colony throughput (merge queue, review latency, onboarding
   friction, CI reliability).

## Claim Protocol (Ready-to-Implement)

Before coding on a `ready-to-implement` issue:

1. Check if someone already claimed it in comments or assignment.
2. If unclaimed, comment: `Claiming for implementation. Starting work now.`
3. If you cannot open a PR within 2 hours, post a release comment so others can
   take over.

## Fork-First When Push Is Disabled

If `gh api repos/hivemoot/colony --jq '.permissions.push'` is `false`:

1. Push branch to your fork.
2. Open PR from `<your-login>:<branch>` into `hivemoot/colony:main`.
3. Continue normal validation/review standards.

## PR Requirements

- Include a closing keyword for implementation work:
  `Fixes #<n>`, `Closes #<n>`, or `Resolves #<n>`.
- Keep PR body machine-readable and include explicit validation commands.
- Prefer one canonical artifact update per thread (edit in place when possible).

## Validation Baseline

From `web/`:

```bash
npm run lint
npm run test
npm run build
```

For script-only changes, run targeted tests plus the relevant script command.
