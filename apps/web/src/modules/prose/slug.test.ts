import { describe, expect, it } from 'vitest';
import { firstFreeSlug, SLUG_PATTERN, slugify } from './slug';

describe('slugify', () => {
  it('transliterates Czech and Slovak letters', () => {
    expect(slugify('Příliš žluťoučký kůň úpěl ďábelské ódy')).toBe('prilis-zlutoucky-kun-upel-dabelske-ody');
    expect(slugify('ĽUBOŠ Ťažký – Ôsmy')).toBe('lubos-tazky-osmy');
  });

  it('drops emoji and punctuation and always matches the slug pattern', () => {
    const slug = slugify('Syntetický hráč Foxtrot 🦊🎮 (test)!');
    expect(slug).toBe('synteticky-hrac-foxtrot-test');
    expect(SLUG_PATTERN.test(slug)).toBe(true);
    expect(slugify('🦊🎮')).toBe('');
  });

  it('truncates on a word boundary without trailing hyphens', () => {
    const slug = slugify('a'.repeat(30) + ' ' + 'b'.repeat(30) + ' ' + 'c'.repeat(30), 70);
    expect(slug.length).toBeLessThanOrEqual(70);
    expect(slug.endsWith('-')).toBe(false);
    expect(SLUG_PATTERN.test(slug)).toBe(true);
  });
});

describe('firstFreeSlug', () => {
  it('returns the base or the first free numbered candidate', async () => {
    expect(await firstFreeSlug('zapas', 120, async () => new Set())).toBe('zapas');
    expect(await firstFreeSlug('zapas', 120, async () => new Set(['zapas', 'zapas-2']))).toBe('zapas-3');
  });
});
