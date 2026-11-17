import { Role, type Role as RoleType } from '@chetna/core';

/**
 * The capability matrix — a pure module, deliberately.
 *
 * It imports nothing from Next and touches no database, so the separations
 * below are unit-testable without a running server. `tests/abuse/rbac.test.ts`
 * asserts each one, because an authorisation model nobody tests is a diagram.
 *
 * The separations that carry weight, and why:
 *
 *  - `ethics:override` is held by HR_APPROVER ALONE — not the owner, not the
 *    security admin. The person who wants to send a harmful lure must not be
 *    the person who can permit it. Without this, the ethics screen is advice.
 *
 *  - `authorize:security` and `authorize:people` are disjoint, so one person
 *    cannot produce both signatures on a grant however senior they are.
 *
 *  - `campaign:send` excludes HR_APPROVER, so an approver is never the operator.
 *
 *  - There is NO capability for reading an individual's results, because no
 *    endpoint provides it. A manager cannot be granted what the architecture
 *    does not contain.
 */
export const CAPABILITIES = {
  'template:write': [Role.OWNER, Role.SECURITY_ADMIN],
  'ethics:override': [Role.HR_APPROVER],
  'campaign:write': [Role.OWNER, Role.SECURITY_ADMIN],
  'campaign:send': [Role.OWNER, Role.SECURITY_ADMIN],
  'campaign:killswitch': [Role.OWNER, Role.SECURITY_ADMIN],
  'authorize:security': [Role.OWNER, Role.SECURITY_ADMIN],
  'authorize:people': [Role.HR_APPROVER],
  'suppression:write': [Role.OWNER, Role.HR_APPROVER],
  'analytics:read': [Role.OWNER, Role.SECURITY_ADMIN, Role.ANALYST, Role.AUDITOR],
  'triage:read': [Role.OWNER, Role.SECURITY_ADMIN, Role.ANALYST],
  'triage:write': [Role.OWNER, Role.SECURITY_ADMIN],
  'governance:read': [Role.OWNER, Role.SECURITY_ADMIN, Role.AUDITOR],
  'retention:run': [Role.OWNER, Role.SECURITY_ADMIN],
  'dsar:run': [Role.OWNER, Role.HR_APPROVER],
  'roster:write': [Role.OWNER, Role.SECURITY_ADMIN, Role.HR_APPROVER],
  'inbox:demo': [Role.OWNER, Role.SECURITY_ADMIN, Role.ANALYST, Role.HR_APPROVER, Role.AUDITOR],
} as const satisfies Record<string, readonly RoleType[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: RoleType, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly RoleType[]).includes(role);
}

/** Capabilities that mutate something. Used by the tests to pin read-only roles. */
export const WRITE_CAPABILITIES: Capability[] = [
  'template:write',
  'ethics:override',
  'campaign:write',
  'campaign:send',
  'campaign:killswitch',
  'authorize:security',
  'authorize:people',
  'suppression:write',
  'triage:write',
  'retention:run',
  'dsar:run',
  'roster:write',
];

export const ROLE_LABEL: Record<RoleType, string> = {
  OWNER: 'Owner',
  SECURITY_ADMIN: 'Security',
  HR_APPROVER: 'People / HR',
  ANALYST: 'Analyst',
  AUDITOR: 'Auditor',
};
