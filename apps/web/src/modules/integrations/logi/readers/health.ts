import 'server-only';
import type { LogiIntegrationEnv } from '../../logi-config';
import { leagueFixturesReaderStatus } from './fixtures';
import { configuredHistorySource } from './history';
import { historyStoreStatus } from './history-store';
import { configuredLeagueSource, leagueReaderStatus } from './league';
import { configuredWarconSource, warconReaderStatus } from './warcon';

/**
 * Server-only capability read model of the approved readers for the administration
 * integration health page (issue #22 wires it). States: `unconfigured` (no key, no
 * approved connection, invalid configuration or, for the tracked fixtures, a key without
 * the explicit `league-fixtures` grant), `configured` (key and, for Warcon, approved
 * connections exist) and `unsupported` (the deployed producer answered 404 on the last
 * attempt: the route is not deployed). The retained game history adds `denied` (the
 * key lacks the explicit `server-game-history` grant or was revoked), `preparing` (the
 * first scan is running), `available` (a complete snapshot exists and the last refresh
 * succeeded), `stale` (a snapshot exists but the last refresh failed or is older than
 * the maximum age) and `error` (no snapshot and the last scan failed). The last attempt
 * outcome comes from the in-process caches and is a safe category, never a response
 * body or key; a League read the producer itself could not refresh is named in the
 * detail.
 */

export const READER_RESOURCES = ['league-matches', 'league-fixtures', 'warcon-data', 'server-game-history'] as const;
export type ReaderResource = (typeof READER_RESOURCES)[number];

export type ReaderCapabilityStateKind = 'unconfigured' | 'configured' | 'unsupported' | 'denied' | 'preparing' | 'available' | 'stale' | 'error';

export type ReaderCapabilityState = {
  state: ReaderCapabilityStateKind;
  /**
   * Short English operator detail (configuration facts only), or the code
   * `synthetic-fixture` when the labelled synthetic reader source is active (the
   * administration translates that one).
   */
  detail: string;
  lastAttemptAt: string | null;
  lastOutcome: string | null;
  /** Approved Warcon connections of the Wardogs source (count only, never IDs); 0 for the League reader. */
  approvedConnections: number;
};

function historyState(env: LogiIntegrationEnv, now: Date): ReaderCapabilityState {
  const history = historyStoreStatus(now);
  const attempt = { lastAttemptAt: history.lastAttemptAt, lastOutcome: history.lastOutcome, approvedConnections: 0 };
  if (!env.LOGI_HISTORY_API_KEY_WDG) return { state: 'unconfigured', detail: 'LOGI_HISTORY_API_KEY_WDG is not set', ...attempt };
  const source = configuredHistorySource(env);
  if (!source) return { state: 'unconfigured', detail: 'no valid Wardogs source in LOGI_SOURCES_JSON', ...attempt };
  const approved = source.historySources.length;
  if (approved === 0) return { state: 'unconfigured', detail: 'no approved historySources on the Wardogs source', ...attempt };
  const sources = `${approved} approved source(s) on ${source.sourceInstanceId}`;
  if (history.lastOutcome === 'not_found') return { state: 'unsupported', detail: 'producer answered 404: server-game-history route not deployed', ...attempt };
  if (history.lastOutcome === 'unauthorized' || history.lastOutcome === 'forbidden') return { state: 'denied', detail: `key lacks the explicit server-game-history grant or was revoked (producer answered ${history.lastOutcome === 'unauthorized' ? '401' : '403'})`, ...attempt };
  const snapshot = history.revision === null ? '' : `; ${history.games} game(s) at revision ${history.revision}, collected ${history.lastCollectedAt ?? 'never'}, refreshed ${history.refreshedAt}, coverage ${history.coverage?.kind === 'window' ? `window from ${history.coverage.from}` : 'all'}`;
  switch (history.state) {
    case 'preparing': return { state: 'preparing', detail: `first scan running; ${sources}`, ...attempt };
    case 'fresh': return { state: 'available', detail: `${sources}${snapshot}`, ...attempt };
    case 'stale': return { state: 'stale', detail: `${sources}${snapshot}; last refresh: ${history.lastOutcome ?? 'ok'}`, ...attempt };
    case 'unavailable': return { state: 'error', detail: `last scan failed: ${history.lastOutcome ?? 'unknown'}; ${sources}`, ...attempt };
    default: return { state: 'configured', detail: `server-game-history grant configured for ${source.sourceInstanceId}; ${sources}`, ...attempt };
  }
}

export function readerCapabilityStates(env: LogiIntegrationEnv, now = new Date()): Record<ReaderResource, ReaderCapabilityState> {
  const league = leagueReaderStatus();
  const fixtures = leagueFixturesReaderStatus();
  const warcon = warconReaderStatus();
  if (env.LOGI_READERS_SOURCE === 'synthetic-fixture') {
    const synthetic: ReaderCapabilityState = { state: 'configured', detail: 'synthetic-fixture', lastAttemptAt: null, lastOutcome: null, approvedConnections: 0 };
    return { 'league-matches': synthetic, 'league-fixtures': synthetic, 'warcon-data': synthetic, 'server-game-history': synthetic };
  }
  const leagueSource = configuredLeagueSource(env);
  const warconSource = configuredWarconSource(env);
  const connections = warconSource?.warconConnections.length ?? 0;
  const leagueAttempt = { lastAttemptAt: league.lastAttemptAt, lastOutcome: league.lastOutcome, approvedConnections: 0 };
  const fixturesAttempt = { lastAttemptAt: fixtures.lastAttemptAt, lastOutcome: fixtures.lastOutcome, approvedConnections: 0 };
  const warconAttempt = { lastAttemptAt: warcon.lastAttemptAt, lastOutcome: warcon.lastOutcome, approvedConnections: connections };
  return {
    'league-matches': !env.LOGI_LEAGUE_API_KEY_WDG
      ? { state: 'unconfigured', detail: 'LOGI_LEAGUE_API_KEY_WDG is not set', ...leagueAttempt }
      : !leagueSource
        ? { state: 'unconfigured', detail: 'no valid Wardogs source in LOGI_SOURCES_JSON', ...leagueAttempt }
        : league.lastOutcome === 'not_found'
          ? { state: 'unsupported', detail: 'producer answered 404: league-matches route not deployed', ...leagueAttempt }
          : { state: 'configured', detail: `league-matches grant configured for ${leagueSource.sourceInstanceId}${league.lastOutcome === 'ok' && league.lastProducerError ? `; last producer error: ${league.lastProducerError}` : ''}`, ...leagueAttempt },
    // The explicit `league-fixtures` grant lives on the same League key; only the producer can tell whether it was granted.
    'league-fixtures': !env.LOGI_LEAGUE_API_KEY_WDG
      ? { state: 'unconfigured', detail: 'LOGI_LEAGUE_API_KEY_WDG is not set', ...fixturesAttempt }
      : !leagueSource
        ? { state: 'unconfigured', detail: 'no valid Wardogs source in LOGI_SOURCES_JSON', ...fixturesAttempt }
        : fixtures.lastOutcome === 'not_found'
          ? { state: 'unsupported', detail: 'producer answered 404: league-fixtures route not deployed', ...fixturesAttempt }
          : fixtures.lastOutcome === 'forbidden'
            ? { state: 'unconfigured', detail: 'key lacks the explicit league-fixtures grant (producer answered 403)', ...fixturesAttempt }
            : { state: 'configured', detail: `league-fixtures grant configured for ${leagueSource.sourceInstanceId}${fixtures.lastOutcome === 'ok' && fixtures.items !== null ? `; ${fixtures.items} tracked fixture(s) at the last read${fixtures.truncated ? ' (more pages remained)' : ''}` : ''}`, ...fixturesAttempt },
    'warcon-data': !env.LOGI_WARCON_API_KEY_WDG
      ? { state: 'unconfigured', detail: 'LOGI_WARCON_API_KEY_WDG is not set', ...warconAttempt }
      : !warconSource
        ? { state: 'unconfigured', detail: 'no valid Wardogs source in LOGI_SOURCES_JSON', ...warconAttempt }
        : connections === 0
          ? { state: 'unconfigured', detail: 'no approved warconConnections on the Wardogs source', ...warconAttempt }
          : warcon.lastOutcome === 'not_found'
            ? { state: 'unsupported', detail: 'producer answered 404: warcon-data route not deployed', ...warconAttempt }
            : { state: 'configured', detail: `${connections} approved connection(s) on ${warconSource.sourceInstanceId}`, ...warconAttempt },
    'server-game-history': historyState(env, now),
  };
}
