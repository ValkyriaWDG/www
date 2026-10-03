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
 * in-process caches and is a safe category, never a response body or key; a League read
 * the producer itself could not refresh is named in the detail.
 */

export const READER_RESOURCES = ['league-matches', 'warcon-data'] as const;
export type ReaderResource = (typeof READER_RESOURCES)[number];

export type ReaderCapabilityState = {
  state: 'unconfigured' | 'configured' | 'unsupported';
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

export function readerCapabilityStates(env: LogiIntegrationEnv): Record<ReaderResource, ReaderCapabilityState> {
  const league = leagueReaderStatus();
  const warcon = warconReaderStatus();
  if (env.LOGI_READERS_SOURCE === 'synthetic-fixture') {
    const synthetic: ReaderCapabilityState = { state: 'configured', detail: 'synthetic-fixture', lastAttemptAt: null, lastOutcome: null, approvedConnections: 0 };
    return { 'league-matches': synthetic, 'warcon-data': synthetic };
  }
  const leagueSource = configuredLeagueSource(env);
  const warconSource = configuredWarconSource(env);
  const connections = warconSource?.warconConnections.length ?? 0;
  const leagueAttempt = { lastAttemptAt: league.lastAttemptAt, lastOutcome: league.lastOutcome, approvedConnections: 0 };
  const warconAttempt = { lastAttemptAt: warcon.lastAttemptAt, lastOutcome: warcon.lastOutcome, approvedConnections: connections };
  return {
    'league-matches': !env.LOGI_LEAGUE_API_KEY_WDG
      ? { state: 'unconfigured', detail: 'LOGI_LEAGUE_API_KEY_WDG is not set', ...leagueAttempt }
      : !leagueSource
        ? { state: 'unconfigured', detail: 'no valid Wardogs source in LOGI_SOURCES_JSON', ...leagueAttempt }
        : league.lastOutcome === 'not_found'
          ? { state: 'unsupported', detail: 'producer answered 404: league-matches route not deployed', ...leagueAttempt }
          : { state: 'configured', detail: `league-matches grant configured for ${leagueSource.sourceInstanceId}${league.lastOutcome === 'ok' && league.lastProducerError ? `; last producer error: ${league.lastProducerError}` : ''}`, ...leagueAttempt },
    'warcon-data': !env.LOGI_WARCON_API_KEY_WDG
      ? { state: 'unconfigured', detail: 'LOGI_WARCON_API_KEY_WDG is not set', ...warconAttempt }
      : !warconSource
        ? { state: 'unconfigured', detail: 'no valid Wardogs source in LOGI_SOURCES_JSON', ...warconAttempt }
        : connections === 0
          ? { state: 'unconfigured', detail: 'no approved warconConnections on the Wardogs source', ...warconAttempt }
          : warcon.lastOutcome === 'not_found'
            ? { state: 'unsupported', detail: 'producer answered 404: warcon-data route not deployed', ...warconAttempt }
            : { state: 'configured', detail: `${connections} approved connection(s) on ${warconSource.sourceInstanceId}`, ...warconAttempt },
  };
}
