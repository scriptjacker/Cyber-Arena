import { describe, expect, it } from 'vitest';
import { Role, type Role as RoleType } from '@chetna/core';
import {
  CAPABILITIES,
  can,
  WRITE_CAPABILITIES,
  type Capability,
} from '@console/rbac';

/**
 * A20 · the authorisation model, asserted rather than diagrammed.
 *
 * These are the separations the product's claims rest on. Each test states the
 * claim it defends, because the point of an RBAC test is not coverage — it is
 * that someone widening a role in six months has to delete a sentence
 * explaining why the separation existed.
 */

const ALL_ROLES = Object.values(Role) as RoleType[];
const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

describe('A20 · separation of duties', () => {
  it('ONLY People/HR can override a harmful-lure block — not the owner, not security', () => {
    expect(can(Role.HR_APPROVER, 'ethics:override')).toBe(true);
    for (const role of ALL_ROLES) {
      if (role === Role.HR_APPROVER) continue;
      expect(
        can(role, 'ethics:override'),
        `${role} must not be able to permit a harmful lure. The person who wants to send it must not be the person who can allow it.`,
      ).toBe(false);
    }
  });

  it('the two authorization slots are disjoint, so one person cannot sign twice', () => {
    const security = CAPABILITIES['authorize:security'] as readonly RoleType[];
    const people = CAPABILITIES['authorize:people'] as readonly RoleType[];
    const overlap = security.filter((r) => people.includes(r));
    expect(
      overlap,
      'A role holding both authorization capabilities could produce both signatures on a grant by itself, which is single control wearing a dual-control costume.',
    ).toEqual([]);
  });

  it('an approver is never the operator', () => {
    expect(can(Role.HR_APPROVER, 'campaign:send')).toBe(false);
    expect(can(Role.HR_APPROVER, 'campaign:write')).toBe(false);
    expect(can(Role.HR_APPROVER, 'template:write')).toBe(false);
  });

  it('there is no capability for reading an individual, because no endpoint provides one', () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(capability).not.toMatch(/individual|participant:read|person/i);
    }
    // The only read capabilities are aggregate or governance scoped.
    const reads = ALL_CAPABILITIES.filter((c) => c.endsWith(':read'));
    expect(reads.sort()).toEqual(['analytics:read', 'governance:read', 'triage:read']);
  });
});

describe('A20 · read-only roles stay read-only', () => {
  it('the analyst can write nothing at all', () => {
    for (const capability of WRITE_CAPABILITIES) {
      expect(can(Role.ANALYST, capability), `analyst must not hold ${capability}`).toBe(false);
    }
  });

  it('the auditor can write nothing at all', () => {
    for (const capability of WRITE_CAPABILITIES) {
      expect(can(Role.AUDITOR, capability), `auditor must not hold ${capability}`).toBe(false);
    }
  });

  it('the auditor can read the record but not the campaign queue', () => {
    expect(can(Role.AUDITOR, 'governance:read')).toBe(true);
    expect(can(Role.AUDITOR, 'analytics:read')).toBe(true);
    expect(can(Role.AUDITOR, 'triage:read')).toBe(false);
  });

  it('the analyst cannot reach governance, which contains the retention controls', () => {
    expect(can(Role.ANALYST, 'governance:read')).toBe(false);
  });
});

describe('A20 · the matrix is complete and closed', () => {
  it('every capability names at least one holder', () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(
        (CAPABILITIES[capability] as readonly RoleType[]).length,
        `${capability} has no holder, so it is dead configuration`,
      ).toBeGreaterThan(0);
    }
  });

  it('every listed holder is a real role', () => {
    for (const capability of ALL_CAPABILITIES) {
      for (const role of CAPABILITIES[capability] as readonly RoleType[]) {
        expect(ALL_ROLES, `${capability} lists unknown role ${role}`).toContain(role);
      }
    }
  });

  it('denies anything not explicitly granted — the matrix is an allowlist', () => {
    // A role invented tomorrow holds nothing until someone writes it down.
    const invented = 'CONTRACTOR' as RoleType;
    for (const capability of ALL_CAPABILITIES) {
      expect(can(invented, capability)).toBe(false);
    }
  });

  it('no single role holds every capability', () => {
    for (const role of ALL_ROLES) {
      const held = ALL_CAPABILITIES.filter((c) => can(role, c));
      expect(
        held.length,
        `${role} holds every capability, which defeats the whole model`,
      ).toBeLessThan(ALL_CAPABILITIES.length);
    }
  });

  it('the owner is powerful but still cannot override ethics', () => {
    const ownerHolds = ALL_CAPABILITIES.filter((c) => can(Role.OWNER, c));
    expect(ownerHolds.length).toBeGreaterThan(8);
    expect(ownerHolds).not.toContain('ethics:override');
    expect(ownerHolds).not.toContain('authorize:people');
  });
});
