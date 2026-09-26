import { formats } from '@/i18n/formats';
import { DISPLAY_TIME_ZONE, FORMAT_LOCALE, type AppLocale } from '@/i18n/routing';

/*
 * Locale-correct display formatting for the community administration: cs-CZ / en-GB
 * conventions (not the bare route locale) with an explicit time zone. Same signature as
 * the shared `@/i18n/date-format` helpers so either can be used; pure, client-safe.
 */

export type DateFormatName = keyof typeof formats.dateTime;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatDate(value: Date | string | number, locale: AppLocale, format: DateFormatName = 'date', timeZone: string = DISPLAY_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const key = `${locale}|${format}|${timeZone}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(FORMAT_LOCALE[locale], { ...formats.dateTime[format], timeZone });
    dateFormatters.set(key, formatter);
  }
  return formatter.format(date);
}

const SHORT_DATE_TIME: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };

/** Compact numeric date + time + zone for dense tables (e.g. `26. 9. 2026 16:01 SELČ`, `26/09/2026, 16:01 CEST`). */
export function formatDateTimeShort(value: Date | string | number, locale: AppLocale, timeZone: string = DISPLAY_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const key = `${locale}|short|${timeZone}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(FORMAT_LOCALE[locale], { ...SHORT_DATE_TIME, timeZone });
    dateFormatters.set(key, formatter);
  }
  return formatter.format(date);
}

export function formatNumber(value: number, locale: AppLocale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(FORMAT_LOCALE[locale], options).format(value);
}
