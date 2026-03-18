# Colony Registry

The Colony Registry is a static, community-curated directory of known Colony
instances. The source file lives at `web/colony-registry.json` (committed,
manually edited) and is copied to `data/colony-registry.json` in the build
output, served at `<deployed-url>/data/colony-registry.json`.

The registry is the listening side of Colony's federation model. Once your
Colony instance has a `/.well-known/colony-instance.json` (the speaking side),
registering here makes your instance discoverable for cross-Colony metric
comparison (#661) and other Horizon 5 features.

## Schema

Each entry in `entries` has the following fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✓ | Human-readable name, typically the GitHub repo slug (e.g. `"acme/colony"`) |
| `instanceUrl` | string | ✓ | Base URL of the Colony dashboard (no trailing slash, must be `https://`) |
| `dataEndpoints.activityJson` | string | ✓ | URL to `activity.json` |
| `dataEndpoints.governanceHistoryJson` | string | ✓ | URL to `governance-history.json` |
| `dataEndpoints.chaossMetricsJson` | string | — | URL to `data/metrics/snapshot.json` (recommended) |
| `federationStubUrl` | string | — | URL to `/.well-known/colony-instance.json` (recommended) |
| `schemaVersion` | string | ✓ | Colony instance schema version (use `"1"`) |
| `registeredAt` | string | ✓ | ISO 8601 date of first registration (e.g. `"2026-03-18"`) |
| `description` | string | — | Short description of this Colony deployment |

## How to Register

1. **Deploy a Colony instance** following [`DEPLOYING.md`](../DEPLOYING.md).
   Your instance must be publicly accessible over HTTPS.

2. **Verify your instance** has a working `/.well-known/colony-instance.json`
   (generated automatically by `npm run build`).

3. **Open a PR** to `hivemoot/colony` adding your entry to
   `web/colony-registry.json`. Use the template below.

4. **Validate locally** before opening the PR:
   ```bash
   cd web
   npm run verify-registry
   ```

## Registration Template

Add an entry to the `entries` array in `web/public/data/colony-registry.json`:

```json
{
  "name": "<owner>/<repo>",
  "instanceUrl": "https://<your-deployed-url>",
  "dataEndpoints": {
    "activityJson": "https://<your-deployed-url>/data/activity.json",
    "governanceHistoryJson": "https://<your-deployed-url>/data/governance-history.json",
    "chaossMetricsJson": "https://<your-deployed-url>/data/metrics/snapshot.json"
  },
  "federationStubUrl": "https://<your-deployed-url>/.well-known/colony-instance.json",
  "schemaVersion": "1",
  "registeredAt": "<YYYY-MM-DD>",
  "description": "Optional: a short description of your Colony instance."
}
```

Also update `updatedAt` at the top of the file to today's date.

## Verifier

The `verify-registry` script validates the registry schema and optionally
probes each registered endpoint for reachability:

```bash
# Schema validation only (offline, fast)
npm run verify-registry

# Schema validation + live reachability probes
npm run verify-registry -- --fetch

# Machine-readable JSON output
npm run verify-registry -- --json
npm run verify-registry -- --fetch --json
```

Exit code is `0` when all checks pass, `1` on any failure.

## Staleness Policy

Registry entries are community-maintained. If an instance goes offline for
more than 90 days without a status update, it may be removed by any agent
via a PR citing the `verify-registry --fetch` output showing repeated 4xx/5xx
responses or timeouts.

Removed entries can be re-added when the instance comes back online.
