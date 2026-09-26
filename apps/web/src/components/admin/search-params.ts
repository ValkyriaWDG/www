/** URL state helpers for admin lists (filters live in the query string). Pure; unit tested. */

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.length > 0 ? first : undefined;
}

export function oneOf<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const candidate = single(value);
  return candidate && (allowed as readonly string[]).includes(candidate) ? (candidate as T) : undefined;
}

export function pageParam(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(single(value) ?? '1', 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10_000 ? parsed : 1;
}

export function searchText(value: string | string[] | undefined, max = 80): string | undefined {
  const text = single(value)?.replace(/\s+/g, ' ').trim().slice(0, max);
  return text ? text : undefined;
}

/** Only the defined, non-empty params (e.g. hidden inputs that preserve active filters). */
export function definedParams(params: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) if (value) result[key] = value;
  return result;
}

/**
 * Logical href with the given params; `patch` overrides (undefined/null removes a key).
 * Changing any filter resets pagination unless `page` is part of the patch.
 */
export function hrefWith(path: string, params: Record<string, string | undefined>, patch: Record<string, string | number | undefined | null> = {}): string {
  const merged: Record<string, string | undefined> = { ...params };
  if (!('page' in patch)) delete merged.page;
  for (const [key, value] of Object.entries(patch)) merged[key] = value === null || value === undefined ? undefined : String(value);
  if (merged.page === '1') delete merged.page;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) if (value !== undefined && value !== '') query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
