import 'server-only';
import type { LogiIntegrationEnv } from '../../logi-config';
import { configuredLeagueSource, leagueReaderStatus } from './league';
import { configuredWarconSource, warconReaderStatus } from './warcon';

/**
 * Server-only capability read model of the approved readers for the administration
 * integration health page (issue #22 wires it). States: `unconfigured` (no key, no
 * approved connection or invalid configuration), `configured` (key and, for Warcon,
 * approved connections exist) and `unsupported` (the deployed producer answered 404 on
 * the last attempt: the route is not deployed). The last attempt outcome comes from the
 * in-process caches and is a safe category, never a response body or key.
 */

export const READER_RESOURCES = ['league-matches', 'warcon-data'] as const;
export type ReaderResource = (typeof READER_RESOURCES)[number];

export type ReaderCapabilityState = {
  state: 'unconfigured' | 'configured' | 'unsupported';
  /** Short English operator detail (configuration facts only). */
  detail: string;
  lastAttemptAt: string | null;
  lastOutcome: string | null;
};

type ReaderEnv = LogiIntegrationEnv & { LOGI_READERS_SOURCE?: 'logi' | 'synthetic-fixture' };

export function readerCapabilityStates(env: ReaderEnv): Record<ReaderResource, ReaderCapabilityState> {
  const league = leagueReaderStatus();
  const warcon = warconReaderStatus();
  if (env.LOGI_READERS_SOURCE === 'synthetic-fixture') {
    const synthetic: ReaderCapabilityState = { state: 'configured', detail: 'synthetic fixture source (tests and review captures only)', lastAttemptAt: null, lastOutcome: null };
    return { 'league-matches': synthetic, 'warcon-data': synthetic };
  }
  const leagueSource = configuredLeagueSource(env);
  const warconSource = configuredWarconSource(env);
  return {
    'league-matches': !env.LOGI_LEAGUE_API_KEY_WDG
      ? { state: 'unconfigured', detail: 'LOGI_LEAGUE_API_KEY_WDG is not set', lastAttemptAt: league.lastAttemptAt, lastOutcome: league.lastOutcome }
      : !leagueSource
        ? { state: 'unconfigured', detail: 'no valid Wardogs source in LOGI_SOURCES_JSON', lastAttemptAt: league.lastAttemptAt, lastOutcome: league.lastOutcome }
        : league.lastOutcome === 'not_found'
          ? { state: 'unsupported', detail: 'producer answered 404: league-matches route not deployed', lastAttemptAt: league.lastAttemptAt, lastOutcome: league.lastOutcome }
          : { state: 'configured', detail: `league-matches grant configured for ${leagueSource.sourceInstanceId}`, lastAttemptAt: league.lastAttemptAt, lastOutcome: league.lastOutcome },
    'warcon-data': !env.LOGI_WARCON_API_KEY_WDG
      ? { state: 'unconfigured', detail: 'LOGI_WARCON_API_KEY_WDG is not set', lastAttemptAt: warcon.lastAttemptAt, lastOutcome: warcon.lastOutcome }
      : !warconSource
        ? { state: 'unconfigured', detail: 'no valid Wardogs source in LOGI_SOURCES_JSON', lastAttemptAt: warcon.lastAttemptAt, lastOutcome: warcon.lastOutcome }
        : warconSource.warconConnections.length === 0
          ? { state: 'unconfigured', detail: 'no approved warconConnections on the Wardogs source', lastAttemptAt: warcon.lastAttemptAt, lastOutcome: warcon.lastOutcome }
          : warcon.lastOutcome === 'not_found'
            ? { state: 'unsupported', detail: 'producer answered 404: warcon-data route not deployed', lastAttemptAt: warcon.lastAttemptAt, lastOutcome: warcon.lastOutcome }
            : { state: 'configured', detail: `${warconSource.warconConnections.length} approved connection(s) on ${warconSource.sourceInstanceId}`, lastAttemptAt: warcon.lastAttemptAt, lastOutcome: warcon.lastOutcome },
  };
}
