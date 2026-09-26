import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber } from './format';
import { dayStart, nextDayStart, pickDate, pickEnum, pickPage, pickParam, queryHref } from './list-query';

describe('admin list query helpers', () => {
  it('reads bounded, trimmed single values and ignores unknown enum values', () => {
    expect(pickParam({ q: ['  wolves ', 'x'] }, 'q')).toBe('wolves');
    expect(pickParam({ q: '   ' }, 'q')).toBeUndefined();
    expect(pickEnum({ status: 'live' }, 'status', ['scheduled', 'live'] as const)).toBe('live');
    expect(pickEnum({ status: 'drop table' }, 'status', ['scheduled', 'live'] as const)).toBeUndefined();
    expect(pickPage({ page: '3' })).toBe(3);
    expect(pickPage({ page: '-1' })).toBe(1);
    expect(pickPage({ page: 'abc' })).toBe(1);
    expect(pickDate({ from: '2026-10-01' }, 'from')).toBe('2026-10-01');
    expect(pickDate({ from: '1.10.2026' }, 'from')).toBeUndefined();
  });

  it('converts inclusive Prague calendar days to instants (DST aware)', () => {
    expect(dayStart('2026-10-25')?.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(nextDayStart('2026-10-25')?.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(nextDayStart('2026-12-31')?.toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });

  it('builds stable URLs without empty parameters', () => {
    expect(queryHref('/admin/matches', { q: 'a b', game: undefined, page: 2, status: '' })).toBe('/admin/matches?q=a+b&page=2');
    expect(queryHref('/admin/matches', {})).toBe('/admin/matches');
  });
});

describe('display formatting', () => {
  it('uses cs-CZ / en-GB conventions with an explicit zone', () => {
    const instant = '2026-11-05T18:00:00.000Z';
    expect(formatDate(instant, 'en', 'dateTimeZone')).toMatch(/^5 November 2026(,| at) 19:00 (CET|GMT\+1)$/);
    expect(formatDate(instant, 'cs', 'dateTimeZone')).toMatch(/^5\. listopadu 2026 v? ?19:00 SEČ$/);
    expect(formatDate(instant, 'en', 'time', 'UTC')).toBe('18:00');
    expect(formatDate('not a date', 'en')).toBe('—');
    expect(formatNumber(1234, 'cs')).toBe('1 234');
  });
});
