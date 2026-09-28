import { z } from 'zod';

/**
 * CRCON (hll_rcon_tool) public server information adapter. CRCON serves
 * `GET <base>/api/get_public_info` without authentication; the website calls it only
 * server-side for the configured Valkyria servers (no arbitrary URL proxy), with a
 * timeout, no redirects and a response size cap, and keeps an allowlisted projection.
 * Both the current response (`current_map.map` layers, `player_count_by_team`,
 * numeric `time_remaining`) and the older flat shape (`human_name`, `players`,
 * `raw_time_remaining`) are read; anything missing or malformed stays `null`.
 */

const PUBLIC_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ADDRESS = /^[A-Za-z0-9.-]{1,253}:\d{2,5}$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
export const CRCON_RESPONSE_LIMIT_BYTES = 512 * 1024;

const sourceBaseUrl = z
  .url({ protocol: /^https?$/ })
  .refine((value) => {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;
    // Plain HTTP only for an isolated local mock; real sources must use HTTPS.
    return url.protocol === 'https:' || LOOPBACK.has(url.hostname);
  }, 'must be an HTTPS origin (optional path) without credentials, query or fragment');

const crconConfigSchema = z
  .array(
    z.object({
      /** Public route identifier (`?server=`). */
      publicId: z.string().regex(PUBLIC_ID).max(64),
      /** Display name chosen by the clan; the live server name is used when omitted. */
      name: z.string().trim().min(1).max(120).optional(),
      /** CRCON base URL; the adapter requests `<baseUrl>/api/get_public_info`. */
      baseUrl: sourceBaseUrl,
      /** Approved public join address (`host:port`). */
      address: z.string().trim().regex(ADDRESS).optional(),
      /** Public live statistics page for this server. */
      statsUrl: z.url({ protocol: /^https$/ }).optional(),
      /** CRCON API key, only when the server locks its statistics API; never logged or sent to browsers. */
      statsApiKey: z.string().trim().min(16).max(256).regex(/^[\x21-\x7e]+$/).optional(),
    }),
  )
  .max(12)
  .refine((servers) => new Set(servers.map((server) => server.publicId)).size === servers.length, 'public IDs must be unique');

export type CrconServerConfig = {
  publicId: string;
  name: string | null;
  baseUrl: string;
  address: string | null;
  statsUrl: string | null;
  statsApiKey?: string | null;
};

/**
 * Parses `HLL_SERVER_SOURCES_JSON`. Invalid configuration disables the whole set and
 * reports a generic reason only (the value can contain private infrastructure hosts).
 */
export function parseCrconConfig(json: string): { servers: CrconServerConfig[]; error: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(json.trim() || '[]');
  } catch {
    return { servers: [], error: 'invalid_json' };
  }
  const parsed = crconConfigSchema.safeParse(raw);
  if (!parsed.success) return { servers: [], error: 'invalid_config' };
  return {
    servers: parsed.data.map((server) => ({
      publicId: server.publicId,
      name: server.name ?? null,
      baseUrl: server.baseUrl,
      address: server.address ?? null,
      statsUrl: server.statsUrl ?? null,
      statsApiKey: server.statsApiKey ?? null,
    })),
    error: null,
  };
}

export type TeamPair = { allied: number; axis: number };

export type CrconPublicInfo = {
  name: string | null;
  map: string | null;
  mode: string | null;
  nextMap: string | null;
  players: number | null;
  capacity: number | null;
  teams: TeamPair | null;
  score: TeamPair | null;
  timeRemainingSeconds: number | null;
};

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

/** Display text: control characters removed, whitespace collapsed, bounded length. */
function text(value: unknown, max = 120): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function count(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : null;
}

function pair(value: unknown, max: number): TeamPair | null {
  const source = record(value);
  if (!source) return null;
  const allied = count(source.allied ?? source.allies, max);
  const axis = count(source.axis, max);
  return allied === null || axis === null ? null : { allied, axis };
}

const MODES: Record<string, string> = { warfare: 'Warfare', offensive: 'Offensive', skirmish: 'Skirmish', control: 'Control' };

function modeLabel(value: unknown): string | null {
  const raw = text(value, 40);
  if (!raw) return null;
  return MODES[raw.toLowerCase()] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Map and mode from a CRCON layer (`{ map: { pretty_name }, game_mode }`) or the older flat fields. */
function layerInfo(slot: unknown): { map: string | null; mode: string | null } {
  const entry = record(slot);
  if (!entry) return { map: null, mode: null };
  const layer = record(entry.map);
  if (layer) {
    const map = record(layer.map);
    return { map: text(map?.pretty_name) ?? text(map?.name) ?? text(layer.pretty_name), mode: modeLabel(layer.game_mode) };
  }
  const legacyName = text(entry.human_name) ?? text(entry.pretty_name);
  const layerId = text(entry.name, 80);
  const mode = layerId?.match(/_(warfare|offensive|skirmish|control)(?:_|$)/i)?.[1] ?? null;
  return { map: legacyName, mode: modeLabel(mode) };
}

function remaining(result: Json): number | null {
  const seconds = result.time_remaining;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 && seconds <= 6 * 3600) return Math.round(seconds);
  const raw = typeof result.raw_time_remaining === 'string' ? result.raw_time_remaining.match(/^(\d{1,2}):(\d{2}):(\d{2})$/) : null;
  if (!raw) return null;
  const total = Number(raw[1]) * 3600 + Number(raw[2]) * 60 + Number(raw[3]);
  return total <= 6 * 3600 ? total : null;
}

/** Allowlisted projection of a CRCON `get_public_info` response; `null` when the response is not a successful result. */
export function parsePublicInfo(body: unknown): CrconPublicInfo | null {
  const envelope = record(body);
  if (!envelope || envelope.failed === true) return null;
  const result = record(envelope.result);
  if (!result) return null;
  const nameEntry = record(result.name);
  const current = layerInfo(result.current_map);
  const next = layerInfo(result.next_map);
  const capacity = count(result.max_player_count, 200);
  const players = count(result.player_count, 200);
  return {
    name: text(nameEntry?.name) ?? text(result.name),
    map: current.map,
    mode: current.mode,
    nextMap: next.map,
    players: players !== null && capacity !== null && players > capacity ? null : players,
    capacity,
    teams: pair(result.player_count_by_team ?? result.players, 200),
    score: pair(result.score, 5),
    timeRemainingSeconds: remaining(result),
  };
}

export class CrconRequestError extends Error {
  constructor(readonly category: 'timeout' | 'upstream' | 'invalid') {
    super(`CRCON request failed (${category})`);
    this.name = 'CrconRequestError';
  }
}

async function readBounded(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new CrconRequestError('invalid');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new CrconRequestError('invalid');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

/** Requests one configured server's public information (no redirects, bounded body). */
export async function fetchPublicInfo(server: CrconServerConfig, signal: AbortSignal, fetchImpl: FetchLike = fetch): Promise<CrconPublicInfo> {
  const base = server.baseUrl.endsWith('/') ? server.baseUrl : `${server.baseUrl}/`;
  const url = new URL('api/get_public_info', base);
  let response: Response;
  try {
    response = await fetchImpl(url, { signal, redirect: 'error', cache: 'no-store', headers: { accept: 'application/json' } });
  } catch {
    throw new CrconRequestError(signal.aborted ? 'timeout' : 'upstream');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new CrconRequestError('upstream');
  }
  let body: unknown;
  try {
    body = JSON.parse(await readBounded(response, CRCON_RESPONSE_LIMIT_BYTES));
  } catch (error) {
    throw error instanceof CrconRequestError ? error : new CrconRequestError('invalid');
  }
  const info = parsePublicInfo(body);
  if (!info) throw new CrconRequestError('invalid');
  return info;
}

/** A scoreboard includes every kill encounter; bounded well above a full 100-player game. */
export const CRCON_SCOREBOARD_LIMIT_BYTES = 16 * 1024 * 1024;

/**
 * Requests one finished game's scoreboard (`<base>/api/get_map_scoreboard?map_id=N`).
 * The game ID is CRCON's numeric map-history ID; the configured statistics API key is
 * sent as a bearer token only when present.
 */
export async function fetchScoreboard(server: CrconServerConfig, gameId: number, signal: AbortSignal, fetchImpl: FetchLike = fetch): Promise<unknown> {
  if (!Number.isSafeInteger(gameId) || gameId <= 0) throw new CrconRequestError('invalid');
  const base = server.baseUrl.endsWith('/') ? server.baseUrl : `${server.baseUrl}/`;
  const url = new URL('api/get_map_scoreboard', base);
  url.searchParams.set('map_id', String(gameId));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (server.statsApiKey) headers.authorization = `Bearer ${server.statsApiKey}`;
  let response: Response;
  try {
    response = await fetchImpl(url, { signal, redirect: 'error', cache: 'no-store', headers });
  } catch {
    throw new CrconRequestError(signal.aborted ? 'timeout' : 'upstream');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new CrconRequestError('upstream');
  }
  try {
    return JSON.parse(await readBounded(response, CRCON_SCOREBOARD_LIMIT_BYTES));
  } catch (error) {
    throw error instanceof CrconRequestError ? error : new CrconRequestError('invalid');
  }
}
