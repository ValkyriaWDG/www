import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber } from './date-format';

// 2026-10-03T17:00:00Z = 19:00 CEST in Prague; 2026-11-03T18:00:00Z = 19:00 CET.
const summer = new Date('2026-10-03T17:00:00Z');
const winter = new Date('2026-11-03T18:00:00Z');

describe('formatDate', () => {
  it('uses British English conventions for en (24h clock, day before month, CEST/CET)', () => {
    expect(formatDate(summer, 'en', 'weekdayDateTime')).toBe('Sat 3 Oct, 19:00 CEST');
    expect(formatDate(winter, 'en', 'weekdayDateTime')).toBe('Tue 3 Nov, 19:00 CET');
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

describe('formatNumber', () => {
  it('groups digits per locale', () => {
    expect(formatNumber(3500, 'cs')).toBe('3 500');
    expect(formatNumber(3500, 'en')).toBe('3,500');
  });
});
