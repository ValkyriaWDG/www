import { describe, expect, it } from 'vitest';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { selectNextWebsiteMatch } from './public-next-match';
import type { PublicMatchSummary } from './types';

const now = new Date('2026-10-05T12:00:00Z');
const local: PublicMatchSummary = { slug: 'synthetic-local', game: 'hell-let-loose', opponentName: 'Synthetic opponent', opponentShortCode: null, opponentLogo: null, competitionType: 'friendly', competitionName: null, startsAt: '2026-10-10T18:00:00Z', timeZone: 'Europe/Prague', originalStartsAt: null, status: 'scheduled', result: null };
const logi: PublicLogiEvent = { ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: '100000000000000001', game: 'hll', kind: 'match', externalId: 'event-1' }, title: 'Synthetic Red / Blue', kind: 'match', status: 'registration', startsAt: '2026-10-09T18:00:00Z', endsAt: '2026-10-09T20:00:00Z', sourceUpdatedAt: null, observedAt: now.toISOString(), teams: [], result: { state: 'unknown', version: null, reviewedAt: null, endedAt: null, participants: [], provenance: null } };

describe('homepage next fixture from published sources', () => {
  it('chooses the earlier Logi fixture and preserves its whole title without inventing an opponent', () => {
    expect(selectNextWebsiteMatch(local, [logi], 'hll', now)).toMatchObject({ href: '/hll/matches/logi/event-1', title: logi.title, startsAt: logi.startsAt });
  });
  it('keeps an earlier local fixture and falls back to the archive when Logi is unavailable', () => {
    expect(selectNextWebsiteMatch(local, [{ ...logi, startsAt: '2026-10-11T18:00:00Z', endsAt: '2026-10-11T20:00:00Z' }], 'hll', now)).toMatchObject({ href: '/hll/matches/synthetic-local', opponent: local.opponentName });
    expect(selectNextWebsiteMatch(local, [], 'hll', now)?.href).toBe('/hll/matches/synthetic-local');
  });
  it('does not advertise the old date of a linked archive fixture after its current event has concluded', () => {
    expect(selectNextWebsiteMatch(local, [{ ...logi, status: 'concluded', archive: { slug: local.slug } }], 'hll', now)).toBeNull();
  });
  it('never substitutes an end date for a missing start or crosses game scope', () => {
    expect(selectNextWebsiteMatch(null, [{ ...logi, startsAt: null }], 'hll', now)).toBeNull();
    expect(selectNextWebsiteMatch(local, [logi], 'wardogs', now)).toBeNull();
  });
});
