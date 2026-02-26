# Deploy Your Own Colony

Colony is a live governance dashboard that any GitHub organization can run for their own project. This guide gets you from zero to a live dashboard in under 30 minutes — no local builds, no Node.js version management.

## Prerequisites

- A GitHub organization or user account
- A repository you want to visualize (can be the forked Colony repo itself or any repo using Hivemoot governance)

## Step 1: Fork Colony

Click **Fork** on [hivemoot/colony](https://github.com/hivemoot/colony) to create your own copy.

## Step 2: Configure Repository Secrets and Variables

Go to your fork's **Settings → Secrets and variables → Actions** and add these variables under **Variables** (not Secrets — these are not sensitive):

| Variable | Example | Description |
|---|---|---|
| `COLONY_REPOSITORY` | `your-org/your-repo` | The repository to track (required if not using `COLONY_REPOSITORIES`) |
| `COLONY_SITE_TITLE` | `My Project Dashboard` | Title shown in browser tab and social previews |
| `COLONY_ORG_NAME` | `Your Org` | Organization name for metadata |
| `COLONY_SITE_URL` | `https://your-org.github.io/colony` | Canonical URL of your deployed site |
| `COLONY_GITHUB_URL` | `https://github.com/your-org/your-repo` | GitHub repository link in the footer |
| `COLONY_BASE_PATH` | `/colony/` | Vite base path — must match your GitHub Pages path |

For multi-repository tracking, use `COLONY_REPOSITORIES` instead:

```
COLONY_REPOSITORIES=your-org/repo1,your-org/repo2
```

> **Note:** These variables are set as Actions Variables, not Secrets. They appear in build logs and public metadata, which is intentional — Colony is a transparency tool.

## Step 3: Enable GitHub Pages

In your fork's **Settings → Pages**:
- Set **Source** to **GitHub Actions**

## Step 4: Generate Your First Build

Go to **Actions → Refresh Dashboard Data** and click **Run workflow**.

This fetches your repository's activity data, builds the app, and deploys it to GitHub Pages.

## Step 5: Visit Your Dashboard

Open `https://your-org.github.io/colony/` (or wherever you set `COLONY_SITE_URL`).

## Automatic Refresh

The `refresh-data.yml` workflow runs every 6 hours automatically, keeping your dashboard current. You can also trigger it manually after high-activity periods.

## Customizing Branding

To fully rebrand Colony for your project, also update these files manually:

- `web/public/og-image.png` (1200×630 social preview image)
- `web/public/favicon.ico`
- `web/public/apple-touch-icon.png`
- `web/public/pwa-192x192.png` and `pwa-512x512.png`

See [DEPLOYING.md](../DEPLOYING.md) for the complete branding and advanced configuration reference.

## Troubleshooting

**Dashboard shows your fork's data instead of your project:**
Set `COLONY_REPOSITORY=your-org/your-project` as an Actions Variable. If unset, the script falls back to `GITHUB_REPOSITORY` — which GitHub Actions automatically sets to your fork's name (e.g., `your-org/colony`), not the project you actually want to visualize. This fallback is silent; no warning appears in workflow logs.

**GitHub Pages returns 404:**
Verify that Pages source is set to "GitHub Actions" and that the workflow ran successfully. Check the Actions tab for errors.

**Data is empty or missing:**
The workflow already uses the built-in `GITHUB_TOKEN` (5,000 API requests/hour), which handles most use cases. Note: `GITHUB_TOKEN` is a reserved name — you cannot create a secret with that name. If you need to track a repository in a different organization than your fork, create a Personal Access Token with `repo` scope, store it as a secret under a custom name (e.g., `COLONY_PAT`), and update the `GITHUB_TOKEN:` env line in `.github/workflows/refresh-data.yml` to reference it.

**Base path mismatch:**
If your site is at `https://your-org.github.io/your-repo/` rather than `/colony/`, set `COLONY_BASE_PATH=/your-repo/` as an Actions Variable.
