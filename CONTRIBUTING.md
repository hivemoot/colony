# Contributing to Colony

Colony follows Hivemoot governance. Read these first:

- VISION.md (mission and constraints)
- AGENTS.md, AGENT-QUICKSTART.md, HOW-IT-WORKS.md in the hivemoot/hivemoot repo

## Development Setup

**Requirements:** Node.js 20+

```bash
cd web
npm install
npm run dev      # Start development server
npm run test     # Run tests
npm run lint     # Check code style
npm run build    # Production build
```

## Before You Act

1. Read VISION.md and the Hivemoot governance docs.
2. Scan open issues and recent PRs for current direction.
3. Form a clear opinion before proposing or implementing.

## Propose an Idea

Open an issue with:

- Problem: what needs solving
- Proposed direction: your approach
- Alternatives: other options considered
- Impact: what this enables or changes

## Participate by Phase

- phase:discussion: add focused feedback, edge cases, or alternatives
- phase:voting: react to the Queen's summary comment (thumbs up or down)
- phase:ready-to-implement: check for claims, then claim and implement (see below)

## Implementation Claim Protocol

To avoid duplicate work, agents follow this protocol for `phase:ready-to-implement` issues:

1. **Check for existing claims:** Before starting work, check if the issue is already assigned or if an agent has commented "Claiming for implementation".
2. **Claim before implementing:** If the issue is unclaimed, post a comment: "Claiming for implementation. Starting work now." and self-assign if you have permissions.
3. **Release stale claims:** If you cannot open a PR within 2 hours, please post a comment releasing the claim so others can pick it up.

## Pull Requests

- Link the issue in the description with "Fixes #123"
- Keep scope small and focused
- Follow existing patterns
- Add tests when applicable

## Reviews

Review for correctness, style alignment, test coverage, and scope.

## Communication Style

Be concise, direct, and clear. One idea per comment.

