import { DEFAULT_MATCH_TIME_ZONE, zonedLocalToInstant } from '@/modules/matches/time';

/** Pure helpers for URL-driven admin list filters (all state lives in the query string). */

export type SearchParams = Record<string, string | string[] | undefined>;

export function pickParam(params: SearchParams, name: string): string | undefined {
  const value = params[name];
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') return undefined;
  const trimmed = first.trim();
  return trimmed === '' ? undefined : trimmed.slice(0, 200);
}

export function pickEnum<T extends string>(params: SearchParams, name: string, allowed: readonly T[]): T | undefined {
  const value = pickParam(params, name);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function pickPage(params: SearchParams): number {
  const value = Number(pickParam(params, 'page'));
  return Number.isInteger(value) && value >= 1 && value <= 100_000 ? value : 1;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` filter value, or undefined when absent/malformed. */
export function pickDate(params: SearchParams, name: string): string | undefined {
  const value = pickParam(params, name);
  return value && DATE.test(value) ? value : undefined;
}

/** Start (00:00) of a local calendar day in Europe/Prague as an instant. */
export function dayStart(date: string, timeZone: string = DEFAULT_MATCH_TIME_ZONE): Date | undefined {
  try {
    return zonedLocalToInstant(`${date}T00:00`, timeZone);
  } catch {
    return undefined;
  }
}

/** Start of the following local day (exclusive upper bound of an inclusive date filter). */
export function nextDayStart(date: string, timeZone: string = DEFAULT_MATCH_TIME_ZONE): Date | undefined {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  if (Number.isNaN(next.getTime())) return undefined;
  return dayStart(next.toISOString().slice(0, 10), timeZone);
}

/** Logical admin URL with only the non-empty parameters, in a stable order. */
export function queryHref(path: string, params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
