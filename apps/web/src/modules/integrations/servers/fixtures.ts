import type { GameRoute } from '@/modules/games/registry';

/**
 * Unmistakably synthetic server observations for development, automated tests and
 * labelled review screenshots. No real server name, address, map rotation or
 * population is represented; ages are relative to the request time so freshness states
 * are reproducible. Alpha uses a public HLL map name (accented) so map artwork can be
 * tested; Bravo's synthetic map stays unknown. Enabled only by
 * `SERVER_STATUS_SOURCE=synthetic-fixture`.
 */
export type SyntheticServer = {
  id: string;
  publicId: string;
  name: string;
  reachability: 'online' | 'offline' | 'unknown';
  map: string | null;
  mode: string | null;
  players: number | null;
  capacity: number | null;
  nextMap: string | null;
  timeRemainingSeconds: number | null;
  score: { allied: number; axis: number } | null;
  teams: { allied: number; axis: number } | null;
  teamScores?: { id: string; label: string; score: number | null }[] | null;
  /** Observation age in seconds, or `null` when the source never reported a time. */
  ageSeconds: number | null;
  address: string | null;
  statsUrl: string | null;
};

export const SYNTHETIC_SERVERS: Readonly<Partial<Record<GameRoute, SyntheticServer[]>>> = {
  wardogs: [{
    id: 'synthetic-wardogs-1', publicId: 'synthetic-wardogs', name: '[SYNTHETIC] Valkyria Wardogs Test Server',
    reachability: 'online', map: 'Synthetic Training Ground', mode: null, players: 0, capacity: 98,
    nextMap: null, timeRemainingSeconds: null, score: null, teams: null,
    teamScores: [{ id: 'alpha', label: 'Alpha', score: 0 }, { id: 'bravo', label: 'Bravo', score: 12 }, { id: 'charlie', label: 'Charlie', score: 7 }],
    ageSeconds: 40, address: null, statsUrl: 'https://stats.synthetic-wardogs.invalid/',
  }],
  hll: [
    {
      id: 'synthetic-hll-1',
      publicId: 'synthetic-alpha',
      name: '[SYNTHETIC] Valkyria Test Server Alpha – Warfare',
      reachability: 'online',
      map: 'Sainte-Mère-Église',
      mode: 'Warfare',
      players: 64,
      capacity: 100,
      nextMap: 'Synthetic Map East',
      timeRemainingSeconds: 54 * 60 + 12,
      score: { allied: 3, axis: 2 },
      teams: { allied: 33, axis: 31 },
      ageSeconds: 40,
      address: 'synthetic-alpha.invalid:7777',
      statsUrl: 'https://stats.synthetic-alpha.invalid/',
    },
    {
      id: 'synthetic-hll-2',
      publicId: 'synthetic-bravo',
      name: '[SYNTHETIC] Valkyria Test Server Bravo – Event server with a deliberately long name for wrapping',
      reachability: 'online',
      map: 'Synthetic Map South',
      mode: 'Offensive',
      players: null,
      capacity: 100,
      nextMap: 'Synthetic Map West',
      timeRemainingSeconds: 20 * 60,
      score: { allied: 2, axis: 2 },
      teams: null,
      ageSeconds: 11 * 60,
      address: null,
      statsUrl: null,
    },
    {
      id: 'synthetic-hll-3',
      publicId: 'synthetic-charlie',
      name: '[SYNTHETIC] Valkyria Test Server Charlie',
      reachability: 'unknown',
      map: null,
      mode: null,
      players: null,
      capacity: null,
      nextMap: null,
      timeRemainingSeconds: null,
      score: null,
      teams: null,
      ageSeconds: null,
      address: null,
      statsUrl: null,
    },
  ],
};
