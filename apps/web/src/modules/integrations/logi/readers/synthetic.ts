import { leagueFixturesPageSchema, leagueReadSchema, warconEnvelopeSchema, type LeagueFixture, type LeagueRead, type LeagueSnapshot, type WarconEnvelope } from './contracts';
import { canonicalLeagueMatchUrl, type LeagueMatchUrl } from './league-url';

/**
 * Unmistakably synthetic reader observations for `LOGI_READERS_SOURCE=synthetic-fixture`
 * (development, browser tests and labelled review captures). They are validated against
 * the same closed wire schemas as a producer response, so the public mapping is exercised
 * unchanged. No real server name, player, League team or fixture is represented.
 */

/**
 * Public server ID of the synthetic Wardogs server (`servers/fixtures.ts`); the live
 * player count (0 / 98) and the named scores match that server-status fixture so the
 * detail panel and the Warcon panel of one page agree.
 */
export const SYNTHETIC_WARCON_PUBLIC_ID = 'synthetic-wardogs';
export const SYNTHETIC_WARCON_CONNECTION_ID = 'synthetic-warcon-connection';

const iso = (at: number) => new Date(at).toISOString();

export function syntheticWarconLive(now: Date): WarconEnvelope {
  const observedAt = now.getTime() - 20_000;
  return warconEnvelopeSchema.parse({
    connectionId: SYNTHETIC_WARCON_CONNECTION_ID, gameId: 'wardogs', provider: 'wardogs_warcon', fetchedAt: iso(now.getTime()), cacheUntil: iso(now.getTime() + 10_000),
    result: {
      view: 'live',
      data: {
        serverId: '00000000-0000-4000-8000-000000000000', ok: true, tier: 'watched', build: 'synthetic', gameServerId: 'synthetic-join-code-never-public',
        startedAt: iso(observedAt - 25 * 60_000), reservedSlots: 0, throttledUntil: null,
        status: {
          serverName: '[SYNTHETIC] Warcon Test Server', map: 'Synthetic Training Ground', experiences: ['Synthetic Objective'], lighting: 'Synthetic Dusk', alternator: 'Default',
          scoreTick: 1, scoreTickMin: 1, scoreTickMax: 10, scoreCap: 100, matchSeconds: 25 * 60, playerCount: 0, maxPlayers: 98,
          scores: [{ name: 'Alpha', colorHex: '#ff0000', score: 0 }, { name: 'Bravo', colorHex: '#00ff00', score: 12 }, { name: 'Charlie', colorHex: '#0000ff', score: 7 }],
          rotationNow: 3, rotationNext: 4,
        },
        players: [{ steamId: '76561198000000001', name: '[SYNTHETIC] Never Public', faction: 'Alpha', kills: 1, deaths: 1, cash: 0, ping: 30 }],
        statusAt: iso(observedAt), playersAt: iso(observedAt), observedAt: iso(observedAt), freshness: 'fresh', playersFreshness: 'fresh',
      },
    },
  });
}

export function syntheticWarconMatches(now: Date): WarconEnvelope {
  const matches = Array.from({ length: 6 }, (_, index) => {
    const startedAt = now.getTime() - (index + 1) * 90 * 60_000;
    return {
      id: 100 - index, startedAt: iso(startedAt), endedAt: iso(startedAt + 45 * 60_000),
      map: index % 2 === 0 ? 'Synthetic Training Ground' : 'Synthetic Harbour', experiences: 'Synthetic Objective', lighting: index % 3 === 0 ? 'Synthetic Dawn' : 'Synthetic Dusk',
      peakPlayers: 40 - index * 3, players: 60 - index * 4,
      finalScores: [{ name: 'Alpha', score: 100 - index * 10 }, { name: 'Bravo', score: 55 + index * 5 }, { name: 'Charlie', score: 20 }],
      winner: index % 2 === 0 ? 'Alpha' : 'Bravo',
    };
  });
  return warconEnvelopeSchema.parse({
    connectionId: SYNTHETIC_WARCON_CONNECTION_ID, gameId: 'wardogs', provider: 'wardogs_warcon', fetchedAt: iso(now.getTime()), cacheUntil: iso(now.getTime() + 60_000),
    result: { view: 'matches', data: { matches, live: [], page: 1, pageSize: 50, total: matches.length, pages: 1 } },
  });
}

/** Synthetic snapshot of one League detail page; the League id is echoed in the title. */
function syntheticLeagueSnapshot(url: LeagueMatchUrl, now: Date, options: { fixtureNumber: number; scheduledAt: string | null; fetchedAt: string }): LeagueSnapshot {
  return {
    id: url.id, sourceUrl: url.url, parserVersion: 'wardogs-league-html/1',
    title: `[SYNTHETIC] SYA · SYB · SYC (${url.id})`, fixtureNumber: options.fixtureNumber, type: 'Friendly', status: 'Scheduled',
    scheduledAt: options.scheduledAt,
    request: null,
    teams: [
      { code: 'SYA', name: 'Synthetic Alpha', profileUrl: 'https://wardogsleague.net/teams/SYA', nations: ['CZE'], displayedMemberCount: 10, faction: 'Synthetic Faction A', readyCheck: 'Ready check not run yet' },
      { code: 'SYB', name: 'Synthetic Bravo', profileUrl: 'https://wardogsleague.net/teams/SYB', nations: ['SVK'], displayedMemberCount: 11, faction: 'Synthetic Faction B', readyCheck: 'Ready check not run yet' },
      { code: 'SYC', name: 'Synthetic Charlie', profileUrl: 'https://wardogsleague.net/teams/SYC', nations: null, displayedMemberCount: 12, faction: null, readyCheck: null },
    ],
    map: { name: 'Synthetic Training Ground', zone: 'Synthetic Zone', lighting: 'Synthetic Dusk' },
    hosting: { mode: 'Self-hosted', teamCode: 'SYA' },
    moderator: 'Awaiting',
    mapVote: { status: 'Open', closesAt: iso(now.getTime() + 24 * 60 * 60_000), ballots: null },
    rules: { summary: '0 of 3 picked', choices: null },
    readyCheck: 'Not started',
    progress: [
      { label: 'Locked', state: 'done', detail: 'synthetic' },
      { label: 'Rules agreed', state: 'current', detail: '0/3' },
      { label: 'Map vote', state: 'not_started', detail: null },
      { label: 'Live', state: 'not_started', detail: null },
    ],
    scoringRule: '1st 3 · 2nd 2 · 3rd 1', results: null, warnings: ['results_not_supported'], fetchedAt: options.fetchedAt,
  };
}

/** A synthetic scheduled League fixture for any accepted detail URL; the League id is echoed in the title. */
export function syntheticLeagueRead(url: LeagueMatchUrl, now: Date): LeagueRead {
  const fetchedAt = iso(now.getTime() - 60_000);
  return leagueReadSchema.parse({
    snapshot: syntheticLeagueSnapshot(url, now, { fixtureNumber: 42, scheduledAt: iso(now.getTime() + 7 * 24 * 60 * 60_000), fetchedAt }),
    stale: false, ageSeconds: 60, lastAttemptAt: fetchedAt, nextRefreshAt: iso(now.getTime() + 4 * 60_000), error: null,
  });
}

/**
 * League IDs of the synthetic tracked fixtures. `alpha` is also the editorial League link
 * of the seeded upcoming Wardogs match (`fixtures/data.ts`), so the list links to that
 * match page and the preview there shows the same snapshot.
 */
export const SYNTHETIC_LEAGUE_FIXTURE_IDS = { alpha: 'synthetic-fixture-alpha', bravo: 'synthetic-fixture-bravo', charlie: 'synthetic-fixture-charlie' } as const;
/** Native event ID of the paused synthetic fixture; never a published Logi event, so no roster link is rendered. */
export const SYNTHETIC_LEAGUE_FIXTURE_EVENT_ID = 'synthetic-logi-event-never-published';
const SYNTHETIC_GUILD_ID = '100000000000000001';

/**
 * Three tracked synthetic fixtures: the alpha fixture of the seeded match (in 7 days,
 * same snapshot as its preview), a second tracked fixture in 10 days and a paused one
 * without a kickoff whose 20-minute-old snapshot the producer flags stale with a
 * `timeout` error. No seeded public Wardogs Logi event exists in the browser fixtures,
 * so the tracked fixtures carry no `eventId`.
 */
export function syntheticLeagueFixtures(now: Date): LeagueFixture[] {
  const day = 24 * 60 * 60_000;
  const fixture = (id: string, overrides: Partial<LeagueFixture> & { fixtureNumber: number; scheduledAt: string | null; fetchedAgoMs: number }): LeagueFixture => {
    const url = canonicalLeagueMatchUrl(`https://wardogsleague.net/matches/${id}`);
    if (!url) throw new Error('synthetic League id rejected');
    const fetchedAt = iso(now.getTime() - overrides.fetchedAgoMs);
    const { fixtureNumber, scheduledAt, fetchedAgoMs, ...rest } = overrides;
    return {
      id: url.id, guildId: SYNTHETIC_GUILD_ID, gameId: 'wardogs', eventId: null, revision: '1', state: 'tracked',
      snapshot: syntheticLeagueSnapshot(url, now, { fixtureNumber, scheduledAt, fetchedAt }),
      stale: false, ageSeconds: Math.floor(fetchedAgoMs / 1000), lastAttemptAt: fetchedAt, error: null,
      ...rest,
    };
  };
  return leagueFixturesPageSchema.parse({
    items: [
      fixture(SYNTHETIC_LEAGUE_FIXTURE_IDS.alpha, { fixtureNumber: 42, scheduledAt: iso(now.getTime() + 7 * day), fetchedAgoMs: 60_000 }),
      fixture(SYNTHETIC_LEAGUE_FIXTURE_IDS.bravo, { fixtureNumber: 43, scheduledAt: iso(now.getTime() + 10 * day), fetchedAgoMs: 90_000, revision: '3' }),
      fixture(SYNTHETIC_LEAGUE_FIXTURE_IDS.charlie, { fixtureNumber: 44, scheduledAt: null, fetchedAgoMs: 20 * 60_000, state: 'paused', stale: true, error: 'timeout', eventId: SYNTHETIC_LEAGUE_FIXTURE_EVENT_ID, revision: '5' }),
    ],
    nextCursor: null,
  }).items;
}
