import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PLATFORM_ONLY_CAPABILITIES, scopesForGrants } from './capabilities';
import { assertCanForGames, canForGame, capabilityScope } from './policy';
import { grantsForRoleIds, parseRoleMapping, rolesForRoleIds } from './role-mapping';
import { testPrincipal } from './testing';
import { AccessDeniedError } from './types';

const HLL_EDITORS = '200000000000000010';
const WDG_MATCHES = '200000000000000011';
const ADMINS = '200000000000000012';

describe('game-scoped role mapping', () => {
  it('keeps member team reads within the granted game and denies stale authority', () => {
    const member = testPrincipal(['member'], { games: ['hell-let-loose'] });
    expect(canForGame(member, 'team.read', 'hell-let-loose')).toBe(true);
    expect(canForGame(member, 'team.read', 'wardogs')).toBe(false);
    expect(canForGame(member, 'admin.access', 'hell-let-loose')).toBe(false);
    expect(canForGame(testPrincipal(['member'], { status: 'stale' }), 'team.read', 'hell-let-loose')).toBe(false);
  });
  it('keeps the digest of an unscoped v1 mapping unchanged', () => {
    const json = JSON.stringify({ '200000000000000002': 'editor', '200000000000000001': ['member'] });
    const parsed = parseRoleMapping(json);
    const legacyCanonical = { '200000000000000001': ['member'], '200000000000000002': ['editor'] };
    expect(parsed.digest).toBe(createHash('sha256').update(JSON.stringify(legacyCanonical)).digest('hex'));
  });

  it('parses scoped entries with explicit database game IDs', () => {
    const parsed = parseRoleMapping(
      JSON.stringify({
        [HLL_EDITORS]: { roles: ['editor'], games: ['hell-let-loose'] },
        [WDG_MATCHES]: { games: ['wardogs', 'wardogs'], roles: 'match_manager' },
        [ADMINS]: 'administrator',
      }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.mapping[HLL_EDITORS]).toEqual({ roles: ['editor'], games: ['hell-let-loose'] });
    expect(parsed.mapping[WDG_MATCHES]).toEqual({ roles: ['match_manager'], games: ['wardogs'] });
    expect(rolesForRoleIds(parsed.mapping, [HLL_EDITORS, WDG_MATCHES])).toEqual(['editor', 'match_manager']);
    expect(grantsForRoleIds(parsed.mapping, [HLL_EDITORS, ADMINS])).toEqual([
      { role: 'editor', games: ['hell-let-loose'] },
      { role: 'administrator', games: 'all' },
    ]);
  });

  it.each([
    [{ roles: ['editor'], games: [] }],
    [{ roles: ['editor'], games: ['hll'] }],
    [{ roles: ['editor'], games: ['all'] }],
    [{ roles: ['editor'] }],
    [{ roles: ['editor'], games: ['wardogs'], extra: true }],
    [{ roles: ['owner'], games: ['wardogs'] }],
    [{ games: ['wardogs'] }],
  ])('fails closed for %j', (entry) => {
    const parsed = parseRoleMapping(JSON.stringify({ [HLL_EDITORS]: entry }));
    expect(parsed.ok).toBe(false);
    expect(grantsForRoleIds(parsed.mapping, [HLL_EDITORS])).toEqual([]);
  });
});

describe('capability game scopes', () => {
  it('unions scopes across roles and lets a platform-wide grant win', () => {
    const { gameScopes } = scopesForGrants([
      { role: 'editor', games: ['hell-let-loose'] },
      { role: 'editor', games: ['wardogs'] },
      { role: 'match_manager', games: 'all' },
    ]);
    expect([...(gameScopes.get('content.edit') as Set<string>)].sort()).toEqual(['hell-let-loose', 'wardogs']);
    expect(gameScopes.get('matches.edit')).toBe('all');
  });

  it('never grants platform-only capabilities through a game-scoped grant', () => {
    const scoped = scopesForGrants([{ role: 'administrator', games: ['hell-let-loose'] }]);
    for (const capability of PLATFORM_ONLY_CAPABILITIES) expect(scoped.capabilities.has(capability)).toBe(false);
    expect(scoped.capabilities.has('content.publish')).toBe(true);
    const global = scopesForGrants([{ role: 'administrator', games: 'all' }]);
    expect(global.capabilities.has('settings.manage')).toBe(true);
  });
});

describe('resource game policy', () => {
  const hllEditor = testPrincipal(['editor'], { games: ['hell-let-loose'] });
  const platformEditor = testPrincipal(['editor']);

  it('allows only resources of the granted game; community needs a platform-wide grant', () => {
    expect(canForGame(hllEditor, 'content.edit', 'hell-let-loose')).toBe(true);
    expect(canForGame(hllEditor, 'content.edit', 'wardogs')).toBe(false);
    expect(canForGame(hllEditor, 'content.edit', null)).toBe(false);
    expect(canForGame(platformEditor, 'content.edit', null)).toBe(true);
    expect(canForGame(platformEditor, 'content.edit', 'wardogs')).toBe(true);
  });

  it('shares identity but not authority: the same session is denied in the other game', () => {
    expect(() => assertCanForGames(hllEditor, 'content.publish', ['hell-let-loose'])).not.toThrow();
    expect(() => assertCanForGames(hllEditor, 'content.publish', ['hell-let-loose', 'wardogs'])).toThrow(AccessDeniedError);
    expect(() => assertCanForGames(hllEditor, 'content.publish', [])).toThrow(AccessDeniedError);
  });

  it('fails closed for stale, anonymous and read-intent write attempts', () => {
    const stale = testPrincipal(['editor'], { status: 'stale' });
    expect(canForGame(stale, 'content.edit', 'hell-let-loose')).toBe(false);
    expect(canForGame({ kind: 'anonymous' }, 'content.edit', 'hell-let-loose')).toBe(false);
    const reader = testPrincipal(['editor'], { intent: 'read', games: ['hell-let-loose'] });
    expect(() => assertCanForGames(reader, 'content.edit', ['hell-let-loose'])).toThrow(AccessDeniedError);
  });

  it('reports list scope for filtering', () => {
    expect(capabilityScope(platformEditor, 'content.read_private')).toBe('all');
    expect([...(capabilityScope(hllEditor, 'content.read_private') as Set<string>)]).toEqual(['hell-let-loose']);
    expect(capabilityScope(hllEditor, 'matches.edit')).toBeNull();
    expect(capabilityScope({ kind: 'system', label: 'runner', capabilities: new Set(['content.publish']) }, 'content.publish')).toBe('all');
  });
});
