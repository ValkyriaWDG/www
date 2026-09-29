import { describe, expect, it } from 'vitest';
import { createTournamentSchema, updateTournamentSchema } from './schemas';

const id = '00000000-0000-4000-8000-00000000c001';

describe('tournament input schemas', () => {
  it('accepts calendar days and HTTPS links, and clears empty optional text', () => {
    const parsed = createTournamentSchema.parse({
      game: 'hell-let-loose',
      name: '  Synthetic League  ',
      season: '',
      startsOn: '2026-09-01',
      endsOn: '2026-12-01',
      links: [{ label: 'Rules', url: 'https://example.org/rules' }],
    });
    expect(parsed).toMatchObject({ name: 'Synthetic League', season: null, startsOn: '2026-09-01', endsOn: '2026-12-01' });
  });

  it('rejects an end before the start, invalid days, plain HTTP links and too many links', () => {
    const issues = (input: unknown) => createTournamentSchema.safeParse(input).error?.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`) ?? [];
    expect(issues({ game: 'hell-let-loose', name: 'X', startsOn: '2026-12-01', endsOn: '2026-09-01' })).toContain('endsOn:ends_before_start');
    expect(issues({ game: 'hell-let-loose', name: 'X', startsOn: '2026-13-01' })).not.toEqual([]);
    expect(issues({ game: 'hell-let-loose', name: 'X', links: [{ label: 'L', url: 'http://example.org' }] })).not.toEqual([]);
    expect(issues({ game: 'hell-let-loose', name: 'X', links: Array.from({ length: 11 }, () => ({ label: 'L', url: 'https://example.org' })) })).not.toEqual([]);
    expect(issues({ game: 'unknown', name: 'X' })).not.toEqual([]);
    expect(issues({ game: 'hell-let-loose', name: '   ' })).not.toEqual([]);
  });

  it('updates only provided fields and keeps the version check', () => {
    expect(updateTournamentSchema.parse({ id, expectedVersion: 2, name: 'Renamed' })).toEqual({ id, expectedVersion: 2, name: 'Renamed' });
    expect(updateTournamentSchema.safeParse({ id, expectedVersion: 0 }).success).toBe(false);
  });
});
