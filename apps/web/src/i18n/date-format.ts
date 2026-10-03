import { formats } from './formats';
import { DISPLAY_TIME_ZONE, FORMAT_LOCALE, type AppLocale } from './routing';

export type DateFormatName = keyof typeof formats.dateTime;

const cache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(locale: AppLocale, format: DateFormatName, timeZone: string): Intl.DateTimeFormat {
  const key = `${locale}|${format}|${timeZone}`;
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(FORMAT_LOCALE[locale], { ...formats.dateTime[format], timeZone });
    cache.set(key, formatter);
  }
  return formatter;
}

/**
 * Formats an instant for display in the UI locale's regional conventions (`cs-CZ` /
 * `en-GB`, never the US defaults of a bare `en`) and the explicit display time zone
 * (Europe/Prague unless an entity carries its own). Pure: usable on server and client.
 */
export function formatDate(
  value: Date | string | number,
  locale: AppLocale,
  format: DateFormatName = 'date',
  timeZone: string = DISPLAY_TIME_ZONE,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatterFor(locale, format, timeZone).format(date);
}

type WeekdayParts = Record<'weekday' | 'day' | 'month' | 'hour' | 'minute' | 'timeZoneName', string>;
const WEEKDAY_PART_TYPES = new Set<string>(['weekday', 'day', 'month', 'hour', 'minute', 'timeZoneName']);
const WEEKDAY_OPTIONS: Record<AppLocale, Intl.DateTimeFormatOptions> = {
  cs: { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' },
  en: { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' },
};
/** Fixed separators per locale: "so 3. 10. 19:00 SELČ" and "Sat 3 Oct, 19:00 CEST". */
const WEEKDAY_PATTERNS: Record<AppLocale, (parts: WeekdayParts) => string> = {
  cs: (p) => `${p.weekday} ${p.day}. ${p.month}. ${p.hour}:${p.minute} ${p.timeZoneName}`,
  en: (p) => `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${p.timeZoneName}`,
};
const partsCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Compact weekday + date + time label ("so 3. 10. 19:00 SELČ", "Sat 3 Oct, 19:00 CEST")
 * for fixture strips and round lists. Built from `formatToParts()` with fixed separators
 * because the literal between weekday and day differs between ICU builds (Node renders
 * "Sat 3 Oct", Chromium "Sat, 3 Oct"), which made a client component's server markup
 * differ from its hydration output (React error #418). The part values themselves
 * (weekday, day, month, hour, minute, zone name) are stable across engines.
 */
export function formatWeekdayDateTime(value: Date | string | number, locale: AppLocale, timeZone: string = DISPLAY_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const key = `${locale}|${timeZone}`;
  let formatter = partsCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(FORMAT_LOCALE[locale], { ...WEEKDAY_OPTIONS[locale], timeZone });
    partsCache.set(key, formatter);
  }
  const parts: WeekdayParts = { weekday: '', day: '', month: '', hour: '', minute: '', timeZoneName: '' };
  for (const part of formatter.formatToParts(date)) {
    if (WEEKDAY_PART_TYPES.has(part.type)) parts[part.type as keyof WeekdayParts] = part.value;
  }
  return WEEKDAY_PATTERNS[locale](parts);
}

/** Formats a number with the UI locale's regional conventions. */
export function formatNumber(value: number, locale: AppLocale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(FORMAT_LOCALE[locale], options).format(value);
}
