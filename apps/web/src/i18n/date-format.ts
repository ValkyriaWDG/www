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

/** Formats a number with the UI locale's regional conventions. */
export function formatNumber(value: number, locale: AppLocale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(FORMAT_LOCALE[locale], options).format(value);
}
