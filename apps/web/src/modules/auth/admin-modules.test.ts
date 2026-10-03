import { describe, expect, it } from 'vitest';
import { testPrincipal } from '@/modules/access/testing';
import type { Actor } from '@/modules/access/types';
import { permittedAdminModules } from './admin-modules';

function keys(actor: Actor) {
  return permittedAdminModules(actor).map((module) => module.key);
}

describe('administration modules match usable resource scopes', () => {
  it('offers community pages and the HLL manual to a platform-wide editor', () => {
    expect(keys(testPrincipal(['editor']))).toEqual(['news', 'manual', 'content', 'taxonomy', 'media', 'members']);
  });

  it('offers the HLL manual without community pages to an HLL-only editor', () => {
    expect(keys(testPrincipal(['editor'], { games: ['hell-let-loose'] }))).toEqual(['news', 'manual', 'taxonomy', 'members']);
  });

  it('offers neither community pages nor the HLL manual to a Wardogs-only editor', () => {
    // Taxonomy stays listed: the page explains that no manageable section is in this scope.
    expect(keys(testPrincipal(['editor'], { games: ['wardogs'] }))).toEqual(['news', 'taxonomy', 'members']);
  });

  it('does not treat separate grants for both games as a platform-wide page grant', () => {
    expect(keys(testPrincipal(['editor'], { games: ['hell-let-loose', 'wardogs'] }))).toEqual(['news', 'manual', 'taxonomy', 'members']);
  });

  it('retains game-scoped match management without unrelated editorial modules', () => {
    expect(keys(testPrincipal(['match_manager'], { games: ['wardogs'] }))).toEqual(['matches', 'tournaments']);
  });

  it('offers no modules without current administrative authority', () => {
    expect(keys({ kind: 'anonymous' })).toEqual([]);
    expect(keys(testPrincipal(['member']))).toEqual([]);
    expect(keys(testPrincipal(['administrator'], { status: 'stale' }))).toEqual([]);
  });
});
