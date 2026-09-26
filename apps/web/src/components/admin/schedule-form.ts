import type { DueAtInput } from '@/modules/content/inputs';
import { DEFAULT_SCHEDULE_TIME_ZONE, isValidTimeZone, resolveLocalDateTime } from '@/modules/content/time';

/**
 * Pure conversion of the schedule form (local date + time + explicit IANA zone +
 * DST occurrence choice) into the schedule use-case input, with the resolved instant
 * for the confirmation sentence. Mirrors the server's `resolveDueAt` so what the author
 * confirms is exactly what is stored; the server validates again.
 */

/** Zones offered in the form; Europe/Prague is the documented default. */
export const SCHEDULE_TIME_ZONES = ['Europe/Prague', 'Europe/Bratislava', 'Europe/London', 'UTC'] as const;

export type ScheduleOccurrence = 'earlier' | 'later';

export type ScheduleFormValues = {
  /** `YYYY-MM-DD` from `<input type="date">`. */
  date: string;
  /** `HH:mm` from `<input type="time">`. */
  time: string;
  timeZone: string;
  /** Which of two repeated wall-clock times (autumn DST fall-back) is meant. */
  occurrence: ScheduleOccurrence;
};

export type ScheduleFormError = 'required' | 'invalid' | 'invalid_time_zone' | 'nonexistent' | 'past';

export type ScheduleFormResult =
  | { ok: true; instant: Date; ambiguous: boolean; candidates: Date[]; dueAt: DueAtInput }
  | { ok: false; error: ScheduleFormError };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export function resolveScheduleForm(values: ScheduleFormValues, now: Date = new Date()): ScheduleFormResult {
  if (!values.date || !values.time) return { ok: false, error: 'required' };
  if (!DATE.test(values.date) || !TIME.test(values.time)) return { ok: false, error: 'invalid' };
  const timeZone = values.timeZone || DEFAULT_SCHEDULE_TIME_ZONE;
  if (!isValidTimeZone(timeZone)) return { ok: false, error: 'invalid_time_zone' };
  const localDateTime = `${values.date}T${values.time}`;
  const resolved = resolveLocalDateTime(localDateTime, timeZone);
  if (!resolved.ok) {
    if (resolved.reason === 'nonexistent') return { ok: false, error: 'nonexistent' };
    if (resolved.reason === 'invalid_time_zone') return { ok: false, error: 'invalid_time_zone' };
    return { ok: false, error: 'invalid' };
  }
  const later = resolved.ambiguous && values.occurrence === 'later' ? resolved.candidates[resolved.candidates.length - 1] : undefined;
  const instant = later ?? resolved.instant;
  if (instant.getTime() <= now.getTime()) return { ok: false, error: 'past' };
  // The server resolves an ambiguous local time to the earlier instant; the later one is
  // therefore sent as an exact UTC instant so the stored due time is what was confirmed.
  const dueAt: DueAtInput = later ? later.toISOString() : { localDateTime, timeZone };
  return { ok: true, instant, ambiguous: resolved.ambiguous, candidates: resolved.candidates, dueAt };
}

/** Wall-clock date/time parts of an instant in a zone (for defaults and re-display). */
export function localParts(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Default proposal: tomorrow 09:00 in the zone. */
export function defaultScheduleValues(now: Date = new Date(), timeZone: string = DEFAULT_SCHEDULE_TIME_ZONE): ScheduleFormValues {
  const tomorrow = localParts(new Date(now.getTime() + 24 * 3_600_000), timeZone);
  return { date: tomorrow.date, time: '09:00', timeZone, occurrence: 'earlier' };
}

/** UTC offset label of an instant in a zone, e.g. `GMT+2` (DST aware). */
export function offsetLabel(instant: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(instant)
    .find((candidate) => candidate.type === 'timeZoneName');
  return part?.value ?? timeZone;
}
