import { describe, expect, it } from 'vitest';
import { CAPABILITIES, capabilitiesForRoles } from './capabilities';
import { assertCan, assertCanWrite, can, denialCode } from './policy';
import { testPrincipal } from './testing';
import { AccessDeniedError } from './types';

describe('capability matrix', () => {
  it('denies anonymous visitors and limits ordinary members to team reads', () => {
    for (const capability of CAPABILITIES) {
      expect(can({ kind: 'anonymous' }, capability)).toBe(false);
      expect(can(testPrincipal(['member']), capability)).toBe(capability === 'team.read');
    }
  });

  it('keeps editor and match-manager privileges distinct', () => {
    const editor = testPrincipal(['editor']);
    const manager = testPrincipal(['match_manager']);
    expect(can(editor, 'content.publish')).toBe(true);
    expect(can(editor, 'matches.publish')).toBe(false);
    expect(can(editor, 'media.match.manage')).toBe(false);
    expect(can(editor, 'settings.manage')).toBe(false);
    expect(can(editor, 'team.read')).toBe(false);
    expect(can(manager, 'team.read')).toBe(true);
    expect(can(manager, 'matches.publish')).toBe(true);
    expect(can(manager, 'content.publish')).toBe(false);
    expect(can(manager, 'media.editorial.manage')).toBe(false);
    expect(can(manager, 'audit.read')).toBe(false);
  });

  it('reserves settings/audit for administrators and access management for owners', () => {
    expect(can(testPrincipal(['administrator']), 'settings.manage')).toBe(true);
    expect(can(testPrincipal(['administrator']), 'audit.read')).toBe(true);
    expect(can(testPrincipal(['administrator']), 'access.manage')).toBe(false);
    expect(can(testPrincipal(['owner']), 'access.manage')).toBe(true);
  });

  it('combines multiple roles', () => {
    const caps = capabilitiesForRoles(['editor', 'match_manager']);
    expect(caps.has('content.publish') && caps.has('matches.publish')).toBe(true);
    expect(caps.has('settings.manage')).toBe(false);
  });
});

describe('fail-closed status handling', () => {
  it.each([
    ['stale', 'stale_authorization'],
    ['unavailable', 'verification_unavailable'],
    ['not_member', 'not_member'],
    ['mfa_required', 'mfa_required'],
  ] as const)('denies %s principals even with a granting role', (status, code) => {
    const actor = testPrincipal(['administrator'], { status });
    expect(can(actor, 'content.publish')).toBe(false);
    expect(denialCode(actor, 'content.publish')).toBe(code);
  });

  it('throws typed errors', () => {
    expect(() => assertCan({ kind: 'anonymous' }, 'admin.access')).toThrow(AccessDeniedError);
    expect(() => assertCanWrite(testPrincipal(['editor'], { intent: 'read' }), 'content.edit')).toThrow(/stale_authorization/);
    expect(() => assertCanWrite(testPrincipal(['editor']), 'content.edit')).not.toThrow();
  });
});
