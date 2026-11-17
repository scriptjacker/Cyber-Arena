import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  domainOf,
  gateOf,
  hashCanonical,
  hashRoster,
  isValidToken,
  newPid,
  newToken,
  newWatermarkId,
  REASON_TEXT,
  ReasonCode,
  reasonText,
} from '@chetna/core';

describe('canonical JSON', () => {
  it('is independent of key order at every depth', () => {
    const a = { b: 1, a: { d: [1, 2], c: 'x' } };
    const b = { a: { c: 'x', d: [1, 2] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(hashCanonical(a)).toBe(hashCanonical(b));
  });

  it('preserves array order, because order is meaning', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('drops undefined members and serialises dates deterministically', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson({ d: new Date('2026-03-10T10:00:00Z') })).toBe(
      '{"d":"2026-03-10T10:00:00.000Z"}',
    );
  });

  it('refuses values that cannot be canonicalised', () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ f: () => 1 })).toThrow(/unsupported type/);
  });

  it('produces a 64-character hex digest', () => {
    expect(hashCanonical({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('roster hashing', () => {
  it('is order-independent over participants', () => {
    expect(hashRoster(['p_c', 'p_a', 'p_b'], 'ros_1')).toBe(
      hashRoster(['p_a', 'p_b', 'p_c'], 'ros_1'),
    );
  });

  it('changes when a person is added — this is what trips scope drift', () => {
    const before = hashRoster(['p_a', 'p_b'], 'ros_1');
    const after = hashRoster(['p_a', 'p_b', 'p_c'], 'ros_1');
    expect(after).not.toBe(before);
  });

  it('is bound to the specific import, so the same people re-imported differ', () => {
    expect(hashRoster(['p_a'], 'ros_1')).not.toBe(hashRoster(['p_a'], 'ros_2'));
  });
});

describe('identifiers carry no personal data', () => {
  it('tokens are 22-character base64url, 128 bits of randomness', () => {
    const t = newToken();
    expect(t).toHaveLength(22);
    expect(isValidToken(t)).toBe(true);
    expect(isValidToken('short')).toBe(false);
    expect(isValidToken('../../etc/passwd000000')).toBe(false);
  });

  it('tokens do not collide across a large batch', () => {
    const set = new Set(Array.from({ length: 20_000 }, () => newToken()));
    expect(set.size).toBe(20_000);
  });

  it('participant ids are opaque and not derived from an email', () => {
    const pid = newPid();
    expect(pid.startsWith('p_')).toBe(true);
    expect(pid).not.toMatch(/@/);
    expect(newPid()).not.toBe(pid);
  });

  it('watermark ids are prefixed so a message can be traced back to a simulation', () => {
    expect(newWatermarkId()).toMatch(/^chetna-sim-[0-9a-f]{12}$/);
  });
});

describe('domain extraction', () => {
  it('lowercases and handles odd input', () => {
    expect(domainOf('Priya.R@Nimbus.TEST')).toBe('nimbus.test');
    expect(domainOf('no-at-sign')).toBe('');
    expect(domainOf('a@b@nimbus.test')).toBe('nimbus.test');
  });
});

describe('reason codes', () => {
  it('every code has human-readable text', () => {
    for (const code of Object.values(ReasonCode)) {
      expect(REASON_TEXT[code], `missing text for ${code}`).toBeTruthy();
      expect(reasonText(code).length).toBeGreaterThan(10);
    }
  });

  it('maps a code to its gate number', () => {
    expect(gateOf(ReasonCode.G1_NO_GRANT)).toBe(1);
    expect(gateOf(ReasonCode.G4_COOLDOWN_ACTIVE)).toBe(4);
    expect(gateOf(ReasonCode.G7_MODE_MISMATCH)).toBe(7);
    expect(gateOf(ReasonCode.ALLOW)).toBeNull();
  });

  it('covers all seven gates', () => {
    const gates = new Set(
      Object.values(ReasonCode)
        .map(gateOf)
        .filter((g): g is 1 | 2 | 3 | 4 | 5 | 6 | 7 => g !== null),
    );
    expect([...gates].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
