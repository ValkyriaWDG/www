/**
 * Wall-clock ↔ instant conversion for IANA time zones using the platform `Intl` data.
 *
 * DST policy (documented contract):
 * - A local time inside a spring-forward gap does not exist (e.g. 2026-03-29 02:30 in
 *   Europe/Prague) and is rejected; the author must choose a real time.
 * - A local time inside a fall-back overlap is ambiguous (e.g. 2026-10-25 02:30 in
 *   Europe/Prague occurs at 00:30Z and 01:30Z). The default `earlier` picks the first
 *   occurrence (summer time); `later` picks the second. The stored UTC instant is
 *   authoritative afterwards.
 */

export const DEFAULT_MATCH_TIME_ZONE = 'Europe/Prague';

export type Disambiguation = 'earlier' | 'later';

export type ZonedTimeErrorCode = 'invalid_time_zone' | 'invalid_local_time' | 'nonexistent_local_time';

export class ZonedTimeError extends Error {
  readonly code: ZonedTimeErrorCode;
  constructor(code: ZonedTimeErrorCode) {
    super(code);
    this.name = 'ZonedTimeError';
    this.code = code;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let existing = formatters.get(timeZone);
  if (!existing) {
    existing = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, existing);
  }
  return existing;
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** Wall-clock fields of `instant` in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** UTC offset of `timeZone` at `epochMs`, in milliseconds (positive east of UTC). */
function offsetAt(epochMs: number, timeZone: string): number {
  const whole = Math.floor(epochMs / 1000) * 1000;
  const p = zonedParts(new Date(whole), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Parses `YYYY-MM-DDTHH:mm[:ss]` and rejects impossible calendar values. */
export function parseLocalDateTime(value: string): ZonedParts {
  const match = LOCAL.exec(value);
  if (!match) throw new ZonedTimeError('invalid_local_time');
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => (part === undefined ? 0 : Number(part))) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    hour > 23
  ) {
    throw new ZonedTimeError('invalid_local_time');
  }
  return { year, month, day, hour, minute, second };
}

/** All instants whose wall clock in `timeZone` equals the given local fields (0, 1 or 2). */
export function instantsForLocal(local: ZonedParts, timeZone: string): Date[] {
  if (!isValidTimeZone(timeZone)) throw new ZonedTimeError('invalid_time_zone');
  const localMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  const offsets = new Set<number>();
  for (const probe of [-36, -12, 0, 12, 36]) offsets.add(offsetAt(localMs + probe * 3_600_000, timeZone));
  const found = new Set<number>();
  for (const offset of offsets) {
    const candidate = localMs - offset;
    if (offsetAt(candidate, timeZone) === offset) found.add(candidate);
  }
  return [...found].sort((a, b) => a - b).map((ms) => new Date(ms));
}

/**
 * Converts a wall-clock time in `timeZone` to its UTC instant, rejecting times that do
 * not exist and resolving repeated times per `disambiguation` (see module docs).
 */
export function zonedLocalToInstant(localDateTime: string, timeZone: string, disambiguation: Disambiguation = 'earlier'): Date {
  const local = parseLocalDateTime(localDateTime);
  const instants = instantsForLocal(local, timeZone);
  if (instants.length === 0) throw new ZonedTimeError('nonexistent_local_time');
  return disambiguation === 'later' ? instants[instants.length - 1]! : instants[0]!;
}

/** `YYYY-MM-DD` calendar date of `instant` in `timeZone`. */
export function zonedDate(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** `YYYY-MM-DDTHH:mm` wall-clock value of `instant` in `timeZone` (for admin forms). */
export function zonedLocalDateTime(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${zonedDate(instant, timeZone)}T${pad(p.hour)}:${pad(p.minute)}`;
}
