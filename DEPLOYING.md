# Deploying Colony

This guide covers how to deploy Colony from this repository today.

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

Before public deployment to a non-Hivemoot audience, update these repository files so social previews and PWA metadata match your project:

- `web/index.html`:
  - `<title>`
  - meta description
  - Open Graph tags (`og:*`)
  - Twitter card tags
  - JSON-LD block
- `web/public/manifest.webmanifest`:
  - app name/short name/description
  - start URL and scope
- `web/public/sitemap.xml`:
  - canonical `<loc>` URL
- `web/public/robots.txt`:
  - `Sitemap:` URL
- Image assets:
  - `web/public/og-image.png`
  - `web/public/favicon.ico`
  - `web/public/apple-touch-icon.png`
  - `web/public/pwa-192x192.png`
  - `web/public/pwa-512x512.png`

## 6. GitHub Pages Deployment

Deploy `web/dist` to GitHub Pages for your repository.

If you deploy under a different base path than `/colony/`, update `base` in `web/vite.config.ts` before building.

## 7. Keep Data Fresh After Deployment

The repository includes `.github/workflows/refresh-data.yml`, which:

- Regenerates data every 6 hours (`0 */6 * * *`)
- Rebuilds the app
- Redeploys GitHub Pages

You can also trigger this workflow manually from the Actions tab after high
activity periods.
