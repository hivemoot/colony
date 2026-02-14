import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('apple-touch-icon asset', () => {
  it('is a valid 180x180 PNG and not the original placeholder', () => {
    const icon = readFileSync('public/apple-touch-icon.png');
    const digest = createHash('sha256').update(icon).digest('hex');

    // Regression guard for the original 419-byte solid-color placeholder icon.
    expect(digest).not.toBe(
      '34f913a33b6e2e661d35254a8436ef990856cd7a4a4fa9e7928a4315384a6ede'
    );
    expect(icon.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(icon.readUInt32BE(16)).toBe(180);
    expect(icon.readUInt32BE(20)).toBe(180);
  });
});
