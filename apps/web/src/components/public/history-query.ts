import { HISTORY_MIN_MINUTES_DEFAULT } from '@/modules/integrations/logi/readers/history-contracts';
import { type HistoryPlayerPublic, type HistoryPublicFilters, type HistoryPublicState, parseHistoryPage, parseHistoryPublicFilters } from '@/modules/integrations/logi/readers/history-public';
import { DISPLAY_TIME_ZONE } from '@/i18n/routing';
import { buildHref, firstParam, type RawSearchParams } from './query';

/*
 * Pure URL state of the public server game history page (`/[game]/history`): the
 * validated query parameters, their conversion to the reader's filters, the period
 * boundaries in the display time zone, the ranking order and small display helpers.
 * Every value read from the query string is bounded or allowlisted; anything else
 * selects the default. No I/O, no `server-only`.
 */

export const HISTORY_PERIODS = ['7d', '30d', '90d', 'all'] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];
export const HISTORY_PERIOD_DEFAULT: HistoryPeriod = '30d';
const PERIOD_DAYS: Record<Exclude<HistoryPeriod, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

export const HISTORY_SORTS = ['kills', 'kd', 'winRate', 'seconds', 'cashDelta', 'deaths', 'matches'] as const;
export type HistorySort = (typeof HISTORY_SORTS)[number];
export const HISTORY_SORT_DEFAULT: HistorySort = 'kills';
export type HistorySortDirection = 'desc' | 'asc';
export const HISTORY_DIR_DEFAULT: HistorySortDirection = 'desc';

/** Ranking rows shown before the "show all" toggle (`players=all`). */
export const HISTORY_RANKING_CAP = 50;

export type HistoryQuery = {
  /** Selected public server ID, or `null` when none is published with history. */
  server: string | null;
  period: HistoryPeriod;
  map: string | null;
  /** Playtime floor in minutes (the reader's bounded value). */
  minMinutes: number;
  sort: HistorySort;
  dir: HistorySortDirection;
  page: number;
  /** `players=all` lifts the ranking cap. */
  allPlayers: boolean;
};

const PUBLIC_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseHistoryPeriod(value: unknown): HistoryPeriod {
  return typeof value === 'string' && (HISTORY_PERIODS as readonly string[]).includes(value) ? (value as HistoryPeriod) : HISTORY_PERIOD_DEFAULT;
}

export function parseHistorySort(value: unknown): HistorySort {
  return typeof value === 'string' && (HISTORY_SORTS as readonly string[]).includes(value) ? (value as HistorySort) : HISTORY_SORT_DEFAULT;
}

export function parseHistoryDirection(value: unknown): HistorySortDirection {
  return value === 'asc' ? 'asc' : HISTORY_DIR_DEFAULT;
}

/**
 * Validated page state. The server falls back to the first published history server when
 * the requested one is unknown or absent, so a stale link never selects nothing.
 */
export function parseHistoryQuery(params: RawSearchParams | undefined, publicIds: readonly string[]): HistoryQuery {
  const requested = firstParam(params, 'server');
  const server = requested !== undefined && requested.length <= 64 && PUBLIC_ID.test(requested) && publicIds.includes(requested) ? requested : publicIds[0] ?? null;
  const filters = parseHistoryPublicFilters({ map: firstParam(params, 'map'), minMinutes: firstParam(params, 'min') });
  return {
    server,
    period: parseHistoryPeriod(firstParam(params, 'period')),
    map: filters.map,
    minMinutes: filters.minMinutes,
    sort: parseHistorySort(firstParam(params, 'sort')),
    dir: parseHistoryDirection(firstParam(params, 'dir')),
    page: parseHistoryPage(firstParam(params, 'page')),
    allPlayers: firstParam(params, 'players') === 'all',
  };
}

/** Whether the URL carries anything beyond the default view (the page is then `noindex`). */
export function hasHistoryQuery(params: RawSearchParams | undefined): boolean {
  return ['server', 'period', 'map', 'min', 'sort', 'dir', 'page', 'players'].some((key) => firstParam(params, key) !== undefined);
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedParts(instant: number, timeZone: string): ZonedParts {
  let formatter = zonedFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    zonedFormatters.set(timeZone, formatter);
  }
  const parts: Partial<ZonedParts> = {};
  for (const part of formatter.formatToParts(new Date(instant))) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day' || part.type === 'hour' || part.type === 'minute' || part.type === 'second') parts[part.type] = Number(part.value);
  }
  return { year: parts.year ?? 1970, month: parts.month ?? 1, day: parts.day ?? 1, hour: parts.hour ?? 0, minute: parts.minute ?? 0, second: parts.second ?? 0 };
}

/** Offset of `timeZone` at `instant` in milliseconds (positive east of UTC). */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant of local midnight `days` days before `now`'s local date in `timeZone`
 * (Europe/Prague by default), correct across daylight-saving changes. Used once per
 * request so every section of a page sees the same boundary.
 */
export function startOfLocalDayDaysAgo(now: Date, days: number, timeZone: string = DISPLAY_TIME_ZONE): Date {
  const today = zonedParts(now.getTime(), timeZone);
  const wall = Date.UTC(today.year, today.month - 1, today.day - days);
  // The offset at the wall time is only known once the instant is; one correction settles a transition between the two.
  const guess = wall - zoneOffsetMs(wall, timeZone);
  return new Date(wall - zoneOffsetMs(guess, timeZone));
}

/** Reader filters of a period: `from` at local midnight N days ago (UTC ISO), `until` open. */
export function historyFiltersFor(query: Pick<HistoryQuery, 'period' | 'map' | 'minMinutes'>, now: Date): HistoryPublicFilters {
  const from = query.period === 'all' ? null : startOfLocalDayDaysAgo(now, PERIOD_DAYS[query.period]).toISOString();
  return { from, until: null, map: query.map, minMinutes: query.minMinutes };
}

/** Logical page URL for a query, omitting default values and page 1. */
export function historyHref(base: string, query: Partial<HistoryQuery>, overrides: Partial<HistoryQuery> = {}): string {
  const merged = { ...query, ...overrides };
  return buildHref(base, [
    ['server', merged.server ?? undefined],
    ['period', merged.period && merged.period !== HISTORY_PERIOD_DEFAULT ? merged.period : undefined],
    ['map', merged.map ?? undefined],
    ['min', merged.minMinutes !== undefined && merged.minMinutes !== HISTORY_MIN_MINUTES_DEFAULT ? merged.minMinutes : undefined],
    ['sort', merged.sort && merged.sort !== HISTORY_SORT_DEFAULT ? merged.sort : undefined],
    ['dir', merged.dir && merged.dir !== HISTORY_DIR_DEFAULT ? merged.dir : undefined],
    ['players', merged.allPlayers ? 'all' : undefined],
    ['page', merged.page],
  ]);
}

/** Sort value of a player row; `null` (unknown K/D, unknown win rate, no known total) always sorts last. */
export function historySortValue(player: HistoryPlayerPublic, sort: HistorySort): number | null {
  switch (sort) {
    case 'kd': return player.kd;
    case 'winRate': return player.winRate;
    case 'matches': return player.matches;
    case 'kills': return player.metrics.kills.value;
    case 'deaths': return player.metrics.deaths.value;
    case 'seconds': return player.metrics.seconds.value;
    case 'cashDelta': return player.metrics.cashDelta.value;
  }
}

/**
 * Ranking order: by the chosen metric in the chosen direction with unknown values last in
 * both directions, then by name and opaque key so the order is stable. Returns a copy.
 */
export function sortHistoryPlayers(players: readonly HistoryPlayerPublic[], sort: HistorySort, dir: HistorySortDirection): HistoryPlayerPublic[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...players].sort((a, b) => {
    const va = historySortValue(a, sort);
    const vb = historySortValue(b, sort);
    if (va === null && vb === null) return tieBreak(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    return sign * (va - vb) || tieBreak(a, b);
  });
}

function tieBreak(a: HistoryPlayerPublic, b: HistoryPlayerPublic): number {
  return (a.name ?? '').localeCompare(b.name ?? '') || a.key.localeCompare(b.key);
}

/** Reader states without a report: the page shows a notice instead of (empty) sections. */
export type HistoryBlockedState = Exclude<HistoryPublicState, 'fresh' | 'stale'>;

export function historyBlockedState(state: HistoryPublicState): HistoryBlockedState | null {
  return state === 'fresh' || state === 'stale' ? null : state;
}

/** Observed playtime as `h:mm` (whole minutes, hours unbounded); `null` stays unknown. */
export function formatPlaytime(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
