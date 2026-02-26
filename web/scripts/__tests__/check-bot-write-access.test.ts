import { describe, expect, it } from 'vitest';
import {
  findInstallation,
  formatTextResult,
  hasContentsWritePermission,
  normalizePermissionValue,
  parseArgs,
  verifyBotWriteAccess,
} from '../check-bot-write-access';

describe('parseArgs', () => {
  it('uses defaults when no flags are provided', () => {
    expect(parseArgs([])).toEqual({
      org: 'hivemoot',
      appSlug: 'hivemoot-bot',
      json: false,
    });
  });

  it('parses overrides', () => {
    expect(
      parseArgs(['--org=example-org', '--app-slug=example-bot', '--json'])
    ).toEqual({
      org: 'example-org',
      appSlug: 'example-bot',
      json: true,
    });
  });
});

describe('findInstallation', () => {
  it('finds app installation by slug case-insensitively', () => {
    const payload = {
      installations: [{ app_slug: 'HiveMoot-Bot', permissions: {} }],
    };

    expect(findInstallation(payload, 'hivemoot-bot')).toEqual(
      payload.installations[0]
    );
  });

  it('returns null when installation payload is malformed', () => {
    expect(findInstallation({}, 'hivemoot-bot')).toBeNull();
    expect(findInstallation({ installations: {} }, 'hivemoot-bot')).toBeNull();
  });
});

describe('normalizePermissionValue', () => {
  it('normalizes permission strings', () => {
    expect(normalizePermissionValue(' Write ')).toBe('write');
  });

  it('returns empty string for non-string values', () => {
    expect(normalizePermissionValue(undefined)).toBe('');
    expect(normalizePermissionValue(1)).toBe('');
  });
});

describe('hasContentsWritePermission', () => {
  it('accepts write and admin', () => {
    expect(
      hasContentsWritePermission({ permissions: { contents: 'write' } })
    ).toEqual({ ok: true, permission: 'write' });
    expect(
      hasContentsWritePermission({ permissions: { contents: 'admin' } })
    ).toEqual({ ok: true, permission: 'admin' });
  });

  it('rejects missing or read-only permissions', () => {
    expect(
      hasContentsWritePermission({ permissions: { contents: 'read' } })
    ).toEqual({ ok: false, permission: 'read' });
    expect(hasContentsWritePermission(null)).toEqual({
      ok: false,
      permission: '',
    });
  });
});

describe('verifyBotWriteAccess', () => {
  it('returns verified when contents permission is write', () => {
    const result = verifyBotWriteAccess(
      { org: 'hivemoot', appSlug: 'hivemoot-bot', json: false },
      () =>
        JSON.stringify({
          installations: [
            {
              id: 123,
              app_slug: 'hivemoot-bot',
              permissions: { contents: 'write' },
            },
          ],
        })
    );

    expect(result.status).toBe('verified');
    expect(result.reason).toBe('contents-write-confirmed');
    expect(result.installationId).toBe(123);
  });

  it('returns blocked for missing app install', () => {
    const result = verifyBotWriteAccess(
      { org: 'hivemoot', appSlug: 'hivemoot-bot', json: false },
      () => JSON.stringify({ installations: [] })
    );
    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'app-not-installed',
    });
  });

  it('returns blocked when gh api execution fails', () => {
    const result = verifyBotWriteAccess(
      { org: 'hivemoot', appSlug: 'hivemoot-bot', json: false },
      () => {
        throw new Error('HTTP 403');
      }
    );
    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'admin-required',
    });
  });
});

describe('formatTextResult', () => {
  it('formats verified output', () => {
    const text = formatTextResult({
      status: 'verified',
      reason: 'contents-write-confirmed',
      org: 'hivemoot',
      appSlug: 'hivemoot-bot',
      command: 'gh api /orgs/hivemoot/installations',
      installationId: 77,
      contentsPermission: 'write',
    });

    expect(text).toContain('VERIFIED: bot write access confirmed');
    expect(text).toContain('installationId=77');
  });

  it('formats blocked output with admin command', () => {
    const text = formatTextResult({
      status: 'blocked',
      reason: 'admin-required',
      org: 'hivemoot',
      appSlug: 'hivemoot-bot',
      command: 'gh api /orgs/hivemoot/installations',
    });

    expect(text).toContain('BLOCKED: admin-required');
    expect(text).toContain('Admin verifier command:');
    expect(text).toContain('select(.app_slug == "hivemoot-bot")');
  });
});
