import { describe, expect, it } from 'vitest';
import { isValidSlug, slugify, withSlugSuffix, SLUG_MAX_LENGTH } from './slug';
import { isValidTimeZone, resolveLocalDateTime } from './time';

describe('slugify', () => {
  it.each([
    ['Příliš žluťoučký kůň', 'prilis-zlutoucky-kun'],
    ['Úpěl ďábelské ódy', 'upel-dabelske-ody'],
    ['  Turnaj: Wardogs — 2026!  ', 'turnaj-wardogs-2026'],
    ['Straße & Łódź', 'strasse-lodz'],
    ['ŘEČ ČÍSEL 3:2', 'rec-cisel-3-2'],
    ['🚀🚀', ''],
  ])('%j → %j', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  it('bounds the length at a word boundary and produces valid slugs', () => {
    const slug = slugify('slovo '.repeat(60));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(isValidSlug(slug)).toBe(true);
    expect(isValidSlug(withSlugSuffix(slug, 12))).toBe(true);
    expect(withSlugSuffix('novinka', 2)).toBe('novinka-2');
  });

  it('validates slugs', () => {
    expect(isValidSlug('ok-slug-1')).toBe(true);
    for (const bad of ['', 'Upper', 'double--hyphen', '-lead', 'trail-', 'diakritika-č', 'a/b', '../x', 'x'.repeat(121)]) {
      expect(isValidSlug(bad), bad).toBe(false);
    }
  });
});

describe('resolveLocalDateTime (Europe/Prague DST)', () => {
  it('converts ordinary winter and summer times', () => {
    const winter = resolveLocalDateTime('2026-01-15T10:00', 'Europe/Prague');
    expect(winter).toMatchObject({ ok: true, ambiguous: false });
    expect(winter.ok && winter.instant.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    const summer = resolveLocalDateTime('2026-07-01T18:30', 'Europe/Prague');
    expect(summer.ok && summer.instant.toISOString()).toBe('2026-07-01T16:30:00.000Z');
  });

  it('rejects a nonexistent local time in the spring gap', () => {
    expect(resolveLocalDateTime('2026-03-29T02:30', 'Europe/Prague')).toEqual({ ok: false, reason: 'nonexistent' });
    const before = resolveLocalDateTime('2026-03-29T01:59', 'Europe/Prague');
    expect(before.ok && before.instant.toISOString()).toBe('2026-03-29T00:59:00.000Z');
    const after = resolveLocalDateTime('2026-03-29T03:00', 'Europe/Prague');
    expect(after.ok && after.instant.toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('resolves an ambiguous autumn time to the earlier instant and reports it', () => {
    const result = resolveLocalDateTime('2026-10-25T02:30', 'Europe/Prague');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ambiguous).toBe(true);
    expect(result.instant.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(result.candidates.map((d) => d.toISOString())).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
  });

  it('supports other zones and rejects invalid input', () => {
    const utc = resolveLocalDateTime('2026-03-29T02:30', 'UTC');
    expect(utc.ok && utc.instant.toISOString()).toBe('2026-03-29T02:30:00.000Z');
    expect(resolveLocalDateTime('2026-02-30T10:00', 'Europe/Prague')).toEqual({ ok: false, reason: 'invalid_format' });
    expect(resolveLocalDateTime('2026-02-10 10:00', 'Europe/Prague')).toEqual({ ok: false, reason: 'invalid_format' });
    expect(resolveLocalDateTime('2026-02-10T10:00', 'Mars/Olympus')).toEqual({ ok: false, reason: 'invalid_time_zone' });
    expect(isValidTimeZone('Europe/Prague')).toBe(true);
    expect(isValidTimeZone('')).toBe(false);
  });
});
