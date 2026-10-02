import { describe, expect, it } from 'vitest';
import { grantsFromLogiMembership } from './logi-grants';

describe('Logi roles preserve game authority', () => {
  const mapping = { '111111': ['administrator'] as const, '222222': { roles: ['editor'] as const, games: ['hell-let-loose'] as const } };
  it('does not turn a role observed in only one game into a platform grant', () => {
    expect(grantsFromLogiMembership(mapping, [{ game: 'wardogs', roleIds: ['111111'] }])).toEqual([{ role: 'administrator', games: ['wardogs'] }]);
  });
  it('grants platform authority only for the same configured role in both games', () => {
    expect(grantsFromLogiMembership(mapping, [{ game: 'wardogs', roleIds: ['111111'] }, { game: 'hell-let-loose', roleIds: ['111111'] }])).toEqual([{ role: 'administrator', games: 'all' }]);
  });
  it('does not export an HLL-scoped mapping into Wardogs', () => {
    expect(grantsFromLogiMembership(mapping, [{ game: 'wardogs', roleIds: ['222222'] }])).toEqual([]);
    expect(grantsFromLogiMembership(mapping, [{ game: 'hell-let-loose', roleIds: ['222222'] }])).toEqual([{ role: 'editor', games: ['hell-let-loose'] }]);
  });
  it('different role IDs with the same name cannot combine into platform authority', () => {
    const roles = { '111111': ['administrator'] as const, '222222': ['administrator'] as const };
    expect(grantsFromLogiMembership(roles, [{ game: 'wardogs', roleIds: ['111111'] }, { game: 'hell-let-loose', roleIds: ['222222'] }])).toEqual([
      { role: 'administrator', games: ['wardogs'] }, { role: 'administrator', games: ['hell-let-loose'] },
    ]);
  });
});
