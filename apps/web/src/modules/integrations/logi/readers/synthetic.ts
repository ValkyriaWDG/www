import { leagueReadSchema, warconEnvelopeSchema, type LeagueRead, type WarconEnvelope } from './contracts';
import type { LeagueMatchUrl } from './league-url';

/**
 * Unmistakably synthetic reader observations for `LOGI_READERS_SOURCE=synthetic-fixture`
 * (development, browser tests and labelled review captures). They are validated against
 * the same closed wire schemas as a producer response, so the public mapping is exercised
 * unchanged. No real server name, player, League team or fixture is represented.
 */

/** Public server ID of the synthetic Wardogs server (`servers/fixtures.ts`). */
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
          scoreTick: 1, scoreTickMin: 1, scoreTickMax: 10, scoreCap: 100, matchSeconds: 25 * 60, playerCount: 12, maxPlayers: 98,
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

/** A synthetic scheduled League fixture for any accepted detail URL; the League id is echoed in the title. */
export function syntheticLeagueRead(url: LeagueMatchUrl, now: Date): LeagueRead {
  const fetchedAt = iso(now.getTime() - 60_000);
  return leagueReadSchema.parse({
    snapshot: {
      id: url.id, sourceUrl: url.url, parserVersion: 'wardogs-league-html/1',
      title: `[SYNTHETIC] SYA · SYB · SYC (${url.id})`, fixtureNumber: 42, type: 'Friendly', status: 'Scheduled',
      scheduledAt: iso(now.getTime() + 7 * 24 * 60 * 60_000),
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
      scoringRule: '1st 3 · 2nd 2 · 3rd 1', results: null, warnings: ['results_not_supported'], fetchedAt,
    },
    stale: false, ageSeconds: 60, lastAttemptAt: fetchedAt, nextRefreshAt: iso(now.getTime() + 4 * 60_000), error: null,
  });
}
