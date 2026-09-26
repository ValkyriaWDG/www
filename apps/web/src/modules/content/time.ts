/**
 * Conversion of an author's local wall-clock time in an IANA zone to an absolute instant,
 * with explicit DST handling (no library needed; uses the platform ICU time-zone data):
 * - a local time inside the spring-forward gap does not exist → `nonexistent`;
 * - a local time repeated in the autumn fall-back hour is ambiguous → the earlier
 *   instant is chosen and `ambiguous: true` is reported with both candidates.
 */

export const DEFAULT_SCHEDULE_TIME_ZONE = 'Europe/Prague';

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export type LocalTimeResolution =
  | { ok: true; instant: Date; ambiguous: boolean; candidates: Date[] }
  | { ok: false; reason: 'invalid_format' | 'invalid_time_zone' | 'nonexistent' };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock time of `instantMs` in `timeZone`, expressed as a UTC epoch value. */
function wallClockMs(instantMs: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour! % 24, parts.minute!, parts.second!);
}

function offsetMs(instantMs: number, timeZone: string): number {
  const whole = Math.floor(instantMs / 1000) * 1000;
  return wallClockMs(whole, timeZone) - whole;
}

/** Resolves `YYYY-MM-DDTHH:mm[:ss]` in `timeZone` to an instant (see module notes). */
export function resolveLocalDateTime(localDateTime: string, timeZone: string): LocalTimeResolution {
  const match = LOCAL_DATE_TIME.exec(localDateTime);
  if (!match) return { ok: false, reason: 'invalid_format' };
  if (!isValidTimeZone(timeZone)) return { ok: false, reason: 'invalid_time_zone' };
  const [year, month, day, hour, minute, second] = match.slice(1).map((value) => Number(value ?? 0)) as number[];
  const wall = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month! - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return { ok: false, reason: 'invalid_format' };
  }
  const DAY = 86_400_000;
  const offsets = new Set([offsetMs(wall - DAY, timeZone), offsetMs(wall, timeZone), offsetMs(wall + DAY, timeZone)]);
  const candidates = [...new Set([...offsets].map((offset) => wall - offset))]
    .filter((instant) => wallClockMs(instant, timeZone) === wall)
    .sort((a, b) => a - b)
    .map((instant) => new Date(instant));
  if (candidates.length === 0) return { ok: false, reason: 'nonexistent' };
  return { ok: true, instant: candidates[0]!, ambiguous: candidates.length > 1, candidates };
}
