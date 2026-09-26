import { formatDate as formatSharedDate, type DateFormatName } from '@/i18n/date-format';
import { DISPLAY_TIME_ZONE, FORMAT_LOCALE, type AppLocale } from '@/i18n/routing';

/*
 * Display formatting for the community administration, built on the shared
 * `@/i18n/date-format` helpers (cs-CZ / en-GB conventions, explicit time zone). Dense admin
 * tables show an explicit dash for a missing or invalid instant. Pure, client-safe.
 */

export { formatNumber, type DateFormatName } from '@/i18n/date-format';

export function formatDate(value: Date | string | number, locale: AppLocale, format: DateFormatName = 'date', timeZone: string = DISPLAY_TIME_ZONE): string {
  return formatSharedDate(value, locale, format, timeZone) || '—';
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

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
