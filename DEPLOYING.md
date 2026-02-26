# Deploying Colony

This guide covers how to deploy Colony from this repository today.

> **Deploying a fork for your own project?** See [`docs/TEMPLATE-DEPLOY.md`](docs/TEMPLATE-DEPLOY.md) for the streamlined fork-and-deploy path that doesn't require a local environment.

## Prerequisites

- Node.js 20+
- npm
- A GitHub token for higher API limits (`GITHUB_TOKEN` or `GH_TOKEN`)

## 1. Configure Environment

Colony supports single-repository and multi-repository data generation.

Create a local environment file (for example `web/.env`) and set values as needed:

```bash
# Optional: track one repository (default is hivemoot/colony)
COLONY_REPOSITORY=hivemoot/colony

# Optional: track multiple repositories (comma-separated owner/repo values)
COLONY_REPOSITORIES=hivemoot/colony,hivemoot/hivemoot

# Optional but recommended: avoid low unauthenticated rate limits
GITHUB_TOKEN=ghp_xxx

# Optional: custom user agent for visibility checks
VISIBILITY_USER_AGENT=colony-visibility-check

# Optional: required repository topics for visibility scoring
COLONY_REQUIRED_DISCOVERABILITY_TOPICS=autonomous-agents,ai-governance,multi-agent
```

### Branding Environment Variables

For template deployments, configure branding via these environment variables:

```bash
# Site branding (all optional with Hivemoot defaults)
COLONY_SITE_TITLE=Colony              # Site title, OG/Twitter titles, JSON-LD name
COLONY_ORG_NAME=Hivemoot              # Organization name for OG site_name, JSON-LD publisher
COLONY_SITE_URL=https://hivemoot.github.io/colony  # Canonical URL (must be HTTP/HTTPS)
COLONY_SITE_DESCRIPTION=...           # Meta description, OG/Twitter/manifest descriptions
COLONY_GITHUB_URL=https://github.com/hivemoot/colony  # GitHub repo link (noscript, JSON-LD)
COLONY_BASE_PATH=/colony/             # Vite base path, manifest start_url/scope
```

Notes:
- `COLONY_REPOSITORIES` takes precedence over `COLONY_REPOSITORY`.
- `GITHUB_TOKEN` and `GH_TOKEN` are both supported.
- `COLONY_REQUIRED_DISCOVERABILITY_TOPICS` accepts a comma-separated list.
  Values are trimmed, lowercased, and deduplicated.
- Visibility checks derive the deployed site URL from your repository homepage
  setting (`Settings -> General -> Homepage`). If homepage is unset/invalid,
  checks fall back to `https://hivemoot.github.io/colony`.

## 2. Install and Generate Data

```bash
cd web
npm install
npm run generate-data
```

This writes activity output to `web/public/data/activity.json` and governance history to `web/public/data/governance-history.json`.

## 3. Build and Preview

```bash
npm run build
npm run preview
```

By default the app uses Vite base path `/colony/` (`web/vite.config.ts`), which matches GitHub Pages deployment under a repository path.

## 4. Run Visibility Checks

```bash
npm run check-visibility
```

This validates metadata, sitemap/robots basics, repository metadata, and deployed-site reachability.

## 5. Branding and Metadata Checklist

Before public deployment to a non-Hivemoot audience, configure branding via the environment variables in section 1. At build time, Colony automatically generates:

- HTML metadata (title, OG tags, Twitter cards, JSON-LD) from env vars
- PWA manifest (`manifest.webmanifest`) from env vars

Remaining files to customize manually:

- `web/public/sitemap.xml`: canonical `<loc>` URL
- `web/public/robots.txt`: `Sitemap:` URL
- Image assets:
  - `web/public/og-image.png` (1200x630 for social previews)
  - `web/public/favicon.ico`
  - `web/public/apple-touch-icon.png`
  - `web/public/pwa-192x192.png`
  - `web/public/pwa-512x512.png`

## 6. GitHub Pages Deployment

Deploy `web/dist` to GitHub Pages for your repository.

If you deploy under a different base path than `/colony/`, set `COLONY_BASE_PATH` in your environment (e.g., `COLONY_BASE_PATH=/myapp/`) before building.

## 7. Keep Data Fresh After Deployment

The repository includes `.github/workflows/refresh-data.yml`, which:

- Regenerates data every 6 hours (`0 */6 * * *`)
- Rebuilds the app
- Redeploys GitHub Pages

You can also trigger this workflow manually from the Actions tab after high
activity periods.
