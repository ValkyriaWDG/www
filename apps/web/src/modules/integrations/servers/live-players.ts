import type { Freshness } from '../contract';
import { CrconRequestError, type CrconServerConfig, type FetchLike } from './crcon';

/** Public round statistics, not an assertion that every participant is still connected. */
export type LivePlayer = {
  name: string;
  side: 'allies' | 'axis' | 'unknown';
  kills: number | null;
  deaths: number | null;
  combat: number | null;
  offense: number | null;
  defense: number | null;
  support: number | null;
};
export type LivePlayersObservation = { observedAt: string; refreshAfterSeconds: number; players: LivePlayer[] };
export type LivePlayersSnapshot = {
  state: 'ok' | 'unavailable' | 'not_configured';
  publicId: string;
  observedAt: string | null;
  freshness: Freshness;
  refreshAfterSeconds: number;
  players: LivePlayer[];
  synthetic: boolean;
};

export const LIVE_PLAYERS_LIMIT_BYTES = 4 * 1024 * 1024;
export const LIVE_PLAYERS_MIN_REFRESH_SECONDS = 30;
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100_000 ? value : null;

/** Unknown counters remain unknown; platform IDs, profiles, IPs and encounters never leave this projection. */
export function parseLivePlayers(body: unknown): LivePlayersObservation | null {
  const envelope = object(body);
  if (!envelope || envelope.failed === true) return null;
  const result = object(envelope.result);
  if (!result || !Array.isArray(result.stats) || result.stats.length > 200) return null;
  const timestamp = result.snapshot_timestamp;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  const observed = new Date(timestamp * 1000);
  if (Number.isNaN(observed.getTime())) return null;
  const players: LivePlayer[] = [];
  for (const item of result.stats) {
    const row = object(item);
    if (!row || typeof row.player !== 'string') return null;
    const name = row.player.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
    if (!name) return null;
    const rawSide = object(row.team)?.side ?? row.team;
    const side = typeof rawSide === 'string' ? rawSide.toLowerCase() : '';
    players.push({ name, side: side === 'allied' || side === 'allies' ? 'allies' : side === 'axis' ? 'axis' : 'unknown', kills: count(row.kills), deaths: count(row.deaths), combat: count(row.combat), offense: count(row.offense), defense: count(row.defense), support: count(row.support) });
  }
  players.sort((a, b) => (b.kills ?? -1) - (a.kills ?? -1) || a.name.localeCompare(b.name, 'en'));
  const refresh = result.refresh_interval_sec;
  return { observedAt: observed.toISOString(), refreshAfterSeconds: typeof refresh === 'number' && Number.isFinite(refresh) ? Math.min(300, Math.max(LIVE_PLAYERS_MIN_REFRESH_SECONDS, Math.ceil(refresh))) : LIVE_PLAYERS_MIN_REFRESH_SECONDS, players };
}

/** Only callers with a validated configured source may call this adapter; no browser URL is accepted. */
export async function fetchLivePlayers(server: CrconServerConfig, signal: AbortSignal, fetchImpl: FetchLike = fetch): Promise<LivePlayersObservation> {
  const url = new URL('api/get_live_game_stats', `${server.baseUrl.replace(/\/$/, '')}/`);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (server.statsApiKey) headers.authorization = `Bearer ${server.statsApiKey}`;
  try {
    const response = await fetchImpl(url, { signal, redirect: 'error', cache: 'no-store', headers });
    if (!response.ok || Number(response.headers.get('content-length')) > LIVE_PLAYERS_LIMIT_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new CrconRequestError(response.ok ? 'invalid' : 'upstream');
    }
    if (!response.body) throw new CrconRequestError('invalid');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > LIVE_PLAYERS_LIMIT_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new CrconRequestError('invalid');
      }
      chunks.push(part.value);
    }
    const parsed = parseLivePlayers(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!parsed) throw new CrconRequestError('invalid');
    return parsed;
  } catch (error) {
    if (error instanceof CrconRequestError) throw error;
    throw new CrconRequestError(signal.aborted ? 'timeout' : 'invalid');
  }
}
