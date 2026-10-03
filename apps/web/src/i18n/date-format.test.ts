import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber, formatWeekdayDateTime } from './date-format';

// 2026-10-03T17:00:00Z = 19:00 CEST in Prague; 2026-11-03T18:00:00Z = 19:00 CET.
const summer = new Date('2026-10-03T17:00:00Z');
const winter = new Date('2026-11-03T18:00:00Z');

describe('formatDate', () => {
  it('uses British English conventions for en (24h clock, day before month, CEST/CET)', () => {
    expect(formatDate(summer, 'en', 'dateTimeZone')).toBe('3 October 2026 at 19:00 CEST');
    expect(formatDate(winter, 'en', 'dateTimeZone')).toBe('3 November 2026 at 19:00 CET');
    expect(formatDate(summer, 'en', 'date')).toBe('3 October 2026');
  });

  it('uses Czech conventions for cs', () => {
    expect(formatDate(summer, 'cs', 'date')).toBe('3. října 2026');
    expect(formatDate(summer, 'cs', 'time')).toBe('19:00');
    expect(formatDate(summer, 'cs', 'dateTimeZone')).toMatch(/19:00 SELČ$/);
  });

  it('keeps the same instant across locales and respects an explicit zone', () => {
    expect(formatDate(summer, 'en', 'time', 'UTC')).toBe('17:00');
    expect(formatDate('not a date', 'cs')).toBe('');
  });
});

describe('formatWeekdayDateTime', () => {
  // The literal between weekday and day differs between ICU builds (Node "Sat 3 Oct",
  // Chromium "Sat, 3 Oct"); the helper joins the parts itself so server and client agree.
  it('renders the same compact label from parts in both locales, summer and winter time', () => {
    expect(formatWeekdayDateTime(summer, 'cs')).toBe('so 3. 10. 19:00 SELČ');
    expect(formatWeekdayDateTime(winter, 'cs')).toBe('út 3. 11. 19:00 SEČ');
    expect(formatWeekdayDateTime(summer, 'en')).toBe('Sat 3 Oct, 19:00 CEST');
    expect(formatWeekdayDateTime(winter, 'en')).toBe('Tue 3 Nov, 19:00 CET');
  });

  it('zero-pads the hour, accepts ISO strings, respects an explicit zone and rejects invalid input', () => {
    expect(formatWeekdayDateTime('2026-10-05T07:05:00Z', 'en')).toBe('Mon 5 Oct, 09:05 CEST');
    expect(formatWeekdayDateTime('2026-10-05T07:05:00Z', 'cs')).toBe('po 5. 10. 09:05 SELČ');
    expect(formatWeekdayDateTime(summer, 'en', 'UTC')).toBe('Sat 3 Oct, 17:00 UTC');
    expect(formatWeekdayDateTime('not a date', 'cs')).toBe('');
  });
});

describe('formatNumber', () => {
  it('groups digits per locale', () => {
    expect(formatNumber(3500, 'cs')).toBe('3 500');
    expect(formatNumber(3500, 'en')).toBe('3,500');
  });
});
