import type { GameRoute } from '@/modules/games/registry';

/**
 * Unmistakably synthetic server observations for development, automated tests and
 * labelled review screenshots. No real server name, address, map rotation or
 * population is represented; ages are relative to the request time so freshness states
 * are reproducible. Enabled only by `SERVER_STATUS_SOURCE=synthetic-fixture`.
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
  /** Observation age in seconds, or `null` when the source never reported a time. */
  ageSeconds: number | null;
  address: string | null;
};

export const SYNTHETIC_SERVERS: Readonly<Partial<Record<GameRoute, SyntheticServer[]>>> = {
  hll: [
    {
      id: 'synthetic-hll-1',
      publicId: 'synthetic-alpha',
      name: '[SYNTHETIC] Valkyria Test Server Alpha – Warfare',
      reachability: 'online',
      map: 'Synthetic Map North',
      mode: 'Warfare',
      players: 64,
      capacity: 100,
      ageSeconds: 40,
      address: 'synthetic-alpha.invalid:7777',
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
      ageSeconds: 11 * 60,
      address: null,
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
      ageSeconds: null,
      address: null,
    },
  ],
};
