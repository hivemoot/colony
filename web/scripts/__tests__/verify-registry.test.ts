import { describe, expect, it } from 'vitest';
import { buildSchemaChecks, parseArgs } from '../verify-registry';
import {
  validateRegistry,
  validateRegistryEntry,
} from '../../shared/colony-registry';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Source registry lives at web/colony-registry.json (two levels up from __tests__)
const REAL_REGISTRY = join(__dirname, '..', '..', 'colony-registry.json');

// ── validateRegistryEntry ─────────────────────────────────────────────────────

describe('validateRegistryEntry', () => {
  const validEntry = {
    name: 'hivemoot/colony',
    instanceUrl: 'https://hivemoot.github.io/colony',
    dataEndpoints: {
      activityJson: 'https://hivemoot.github.io/colony/data/activity.json',
      governanceHistoryJson:
        'https://hivemoot.github.io/colony/data/governance-history.json',
    },
    schemaVersion: '1',
    registeredAt: '2026-02-01',
  };

  it('accepts a minimal valid entry', () => {
    const { valid, errors } = validateRegistryEntry(validEntry, 0);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('accepts an entry with all optional fields', () => {
    const entry = {
      ...validEntry,
      dataEndpoints: {
        ...validEntry.dataEndpoints,
        chaossMetricsJson:
          'https://hivemoot.github.io/colony/data/metrics/snapshot.json',
      },
      federationStubUrl:
        'https://hivemoot.github.io/colony/.well-known/colony-instance.json',
      description: 'A test Colony instance.',
    };
    const { valid, errors } = validateRegistryEntry(entry, 0);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing name', () => {
    const { valid, errors } = validateRegistryEntry(
      { ...validEntry, name: '' },
      0
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('rejects an http instanceUrl', () => {
    const { valid, errors } = validateRegistryEntry(
      { ...validEntry, instanceUrl: 'http://insecure.example.com' },
      0
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('instanceUrl'))).toBe(true);
  });

  it('rejects a missing instanceUrl', () => {
    const { valid, errors } = validateRegistryEntry(
      { ...validEntry, instanceUrl: undefined },
      0
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('instanceUrl'))).toBe(true);
  });

  it('rejects an invalid registeredAt', () => {
    const { valid, errors } = validateRegistryEntry(
      { ...validEntry, registeredAt: 'not-a-date' },
      0
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('registeredAt'))).toBe(true);
  });

  it('rejects a missing dataEndpoints', () => {
    const { valid, errors } = validateRegistryEntry(
      { ...validEntry, dataEndpoints: null },
      0
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('dataEndpoints'))).toBe(true);
  });

  it('rejects a non-https activityJson', () => {
    const { valid, errors } = validateRegistryEntry(
      {
        ...validEntry,
        dataEndpoints: {
          ...validEntry.dataEndpoints,
          activityJson: 'http://example.com/activity.json',
        },
      },
      0
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('activityJson'))).toBe(true);
  });

  it('rejects an invalid optional chaossMetricsJson', () => {
    const { valid, errors } = validateRegistryEntry(
      {
        ...validEntry,
        dataEndpoints: {
          ...validEntry.dataEndpoints,
          chaossMetricsJson: 'not-a-url',
        },
      },
      0
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('chaossMetricsJson'))).toBe(true);
  });

  it('rejects an invalid optional federationStubUrl', () => {
    const { valid, errors } = validateRegistryEntry(
      { ...validEntry, federationStubUrl: 'ftp://bad.example.com' },
      0
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('federationStubUrl'))).toBe(true);
  });

  it('rejects a non-string description', () => {
    const { valid, errors } = validateRegistryEntry(
      { ...validEntry, description: 42 },
      0
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('description'))).toBe(true);
  });

  it('returns an error when entry is not an object', () => {
    const { valid, errors } = validateRegistryEntry('not-an-object', 0);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ── validateRegistry ──────────────────────────────────────────────────────────

describe('validateRegistry', () => {
  const validEntry = {
    name: 'hivemoot/colony',
    instanceUrl: 'https://hivemoot.github.io/colony',
    dataEndpoints: {
      activityJson: 'https://hivemoot.github.io/colony/data/activity.json',
      governanceHistoryJson:
        'https://hivemoot.github.io/colony/data/governance-history.json',
    },
    schemaVersion: '1',
    registeredAt: '2026-02-01',
  };

  it('accepts a valid registry', () => {
    const raw = {
      schemaVersion: '1',
      updatedAt: '2026-03-18',
      entries: [validEntry],
    };
    const { registry, errors } = validateRegistry(raw);
    expect(errors).toHaveLength(0);
    expect(registry).not.toBeNull();
    expect(registry?.entries).toHaveLength(1);
  });

  it('accepts an empty entries array', () => {
    const raw = {
      schemaVersion: '1',
      updatedAt: '2026-03-18',
      entries: [],
    };
    const { registry, errors } = validateRegistry(raw);
    expect(errors).toHaveLength(0);
    expect(registry?.entries).toHaveLength(0);
  });

  it('rejects a missing schemaVersion', () => {
    const { errors } = validateRegistry({
      updatedAt: '2026-03-18',
      entries: [],
    });
    expect(errors.some((e) => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects a missing updatedAt', () => {
    const { errors } = validateRegistry({
      schemaVersion: '1',
      entries: [],
    });
    expect(errors.some((e) => e.includes('updatedAt'))).toBe(true);
  });

  it('rejects a non-array entries field', () => {
    const { errors } = validateRegistry({
      schemaVersion: '1',
      updatedAt: '2026-03-18',
      entries: 'not-an-array',
    });
    expect(errors.some((e) => e.includes('entries'))).toBe(true);
  });

  it('propagates entry-level errors', () => {
    const { errors } = validateRegistry({
      schemaVersion: '1',
      updatedAt: '2026-03-18',
      entries: [{ ...validEntry, name: '' }],
    });
    expect(errors.some((e) => e.includes('entries[0]'))).toBe(true);
  });

  it('rejects null input', () => {
    const { registry, errors } = validateRegistry(null);
    expect(registry).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ── buildSchemaChecks ─────────────────────────────────────────────────────────

describe('buildSchemaChecks', () => {
  it('fails gracefully when the registry file does not exist', () => {
    const checks = buildSchemaChecks('/nonexistent/path/colony-registry.json');
    const fileCheck = checks.find((c) => c.label === 'registry file exists');
    expect(fileCheck?.ok).toBe(false);
  });

  it('passes all schema checks for the real registry file', () => {
    const checks = buildSchemaChecks(REAL_REGISTRY);
    const failed = checks.filter((c) => !c.ok);
    expect(failed).toHaveLength(0);
  });

  it('includes a per-entry schema check for each entry in the real registry', () => {
    const checks = buildSchemaChecks(REAL_REGISTRY);
    const entryChecks = checks.filter((c) => c.label.includes('schema'));
    expect(entryChecks.length).toBeGreaterThan(0);
  });
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('defaults fetch and json to false', () => {
    const opts = parseArgs([]);
    expect(opts.fetch).toBe(false);
    expect(opts.json).toBe(false);
  });

  it('sets fetch=true when --fetch is present', () => {
    expect(parseArgs(['--fetch']).fetch).toBe(true);
  });

  it('sets json=true when --json is present', () => {
    expect(parseArgs(['--json']).json).toBe(true);
  });

  it('reads REGISTRY_FILE from env', () => {
    const opts = parseArgs([], { REGISTRY_FILE: '/custom/path.json' });
    expect(opts.registryFile).toBe('/custom/path.json');
  });

  it('uses default registry file when REGISTRY_FILE is unset', () => {
    const opts = parseArgs([], {});
    expect(opts.registryFile).toContain('colony-registry.json');
  });
});
