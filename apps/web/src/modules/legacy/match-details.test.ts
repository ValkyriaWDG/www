import { describe, expect, it } from 'vitest';
import { normalizeLegacyMatch } from './import-match';
import { sourceHash } from './import-contract';
import { normalizeLegacyMatchDetails, parseLegacyMatchDetails } from './match-details';

const row = {
  id: 9301, date: '27/09/2020 19:30', time: '20:30', completed: true,
  teams: { home: { name: 'VLK + Synthetic', score: 3, side: 'allies', country: 'CZ' }, away: { name: 'Synthetic', score: 2, side: 'axis', country: 'CIS' } },
  league: { name: 'Friendly' }, format: 'best of 1', capPoint: 'Central point', point: 'Legacy point', points: ['First', 'Second'], length: '90:30',
  first_capture: 'allies', first_captured: 'axis',
  links: [{ url: 'https://example.org/video', title: 'Synthetic recording', description: 'Synthetic description', author: 'Synthetic author', date: '27/09/2020 19:30', type: 'youtube' }],
};

describe('allowlisted legacy match details', () => {
  it('retains separate source fields, link credits, coalition names and regional country labels', () => {
    const details = normalizeLegacyMatchDetails(row);
    expect(details).toEqual({ version: 1, homeTeamName: 'VLK + Synthetic', awayTeamName: 'Synthetic', homeCountry: 'CZ', awayCountry: 'CIS', homeSide: 'allies', awaySide: 'axis', homeSideLabel: 'allies', awaySideLabel: 'axis', capturePoint: 'Central point', legacyPoint: 'Legacy point', points: ['First', 'Second'], durationMinutes: 90.5, firstCapture: 'allies', legacyFirstCaptured: 'axis', firstCaptureConflict: true, sourceDate: row.date, separateTime: '20:30', timeConflict: true, clock: 'legacy-fixed-offset', sourceLinks: row.links });
    expect(parseLegacyMatchDetails({ ...details, privateRoster: ['PRIVATE-MARKER'] })).toEqual(details);
  });

  it('keeps the original normalized identity unchanged when adding fields absent from version 1', () => {
    const before = { ...row, time: undefined, point: undefined, first_capture: undefined, first_captured: undefined, links: row.links.map(({ url, title, author }) => ({ url, title, author })) };
    expect(sourceHash(normalizeLegacyMatch(before).row)).toBe(sourceHash(normalizeLegacyMatch(row).row));
    expect(sourceHash(normalizeLegacyMatchDetails(before))).not.toBe(sourceHash(normalizeLegacyMatchDetails(row)));
    expect(normalizeLegacyMatch(row).facts.startsAt).toEqual(new Date('2020-09-27T18:30:00Z'));
  });

  it('does not invent unknown sides, capture fields, times or link metadata', () => {
    const minimal = { ...row, teams: { home: { name: 'VLK', score: 0 }, away: { name: 'Synthetic', score: 0 } }, time: undefined, capPoint: undefined, point: undefined, points: undefined, length: undefined, first_capture: undefined, first_captured: undefined, links: [{ url: 'https://example.org/video' }] };
    expect(normalizeLegacyMatchDetails(minimal)).toMatchObject({ homeCountry: null, awayCountry: null, homeSide: null, awaySide: null, capturePoint: null, legacyPoint: null, points: [], durationMinutes: null, firstCapture: null, legacyFirstCaptured: null, firstCaptureConflict: false, separateTime: null, timeConflict: false, sourceLinks: [{ url: 'https://example.org/video', title: null, description: null, author: null, date: null, type: null }] });
  });

  it('preserves a single alternate capture field and recognizes equivalent separate times', () => {
    expect(normalizeLegacyMatchDetails({ ...row, first_capture: undefined, time: '19:30' }, 'europe-prague')).toMatchObject({ firstCapture: null, legacyFirstCaptured: 'axis', firstCaptureConflict: false, timeConflict: false, clock: 'europe-prague' });
  });

  it('retains source side labels without guessing a combat side for mixed or special formats', () => {
    expect(normalizeLegacyMatchDetails({ ...row, teams: { home: { ...row.teams.home, side: 'both' }, away: { ...row.teams.away, side: 'TS allies' } } })).toMatchObject({ homeSide: null, awaySide: null, homeSideLabel: 'both', awaySideLabel: 'TS allies' });
  });

  it.each([
    { time: '99:99' }, { first_capture: 'private-invalid' }, { point: 'Unsafe\u0000text' },
    { links: [{ url: 'https://user:password@example.org/video' }] },
    { links: [{ url: 'javascript:alert(1)' }] },
    { links: [{ url: 'https://example.org', description: 'x'.repeat(2001) }] },
  ])('rejects malformed extra source fields instead of silently losing them: %j', (extra) => {
    expect(() => normalizeLegacyMatchDetails({ ...row, ...extra })).toThrow();
  });

  it('rejects malformed persisted details and contradictory derived flags', () => {
    const details = normalizeLegacyMatchDetails(row);
    expect(parseLegacyMatchDetails(undefined)).toBeNull();
    expect(parseLegacyMatchDetails({ ...details, version: 2 })).toBeNull();
    expect(parseLegacyMatchDetails({ ...details, timeConflict: false })).toBeNull();
    expect(parseLegacyMatchDetails({ ...details, firstCaptureConflict: false })).toBeNull();
    expect(parseLegacyMatchDetails({ ...details, sourceLinks: [{ ...row.links[0], url: 'http://example.org' }] })).toBeNull();
  });
});
