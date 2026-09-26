import { z } from 'zod';

/** Route slug: lowercase ASCII words joined by single hyphens (matches the DB CHECK). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 120;

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(SLUG_MAX_LENGTH)
  .regex(SLUG_PATTERN, 'slug must contain lowercase letters, digits and single hyphens');

export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

/** Letters that Unicode decomposition does not reduce to ASCII. */
const SPECIAL: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
  ı: 'i',
};

/**
 * Transliterates a title into a slug (Czech diacritics → ASCII), e.g.
 * "Příliš žluťoučký kůň" → "prilis-zlutoucky-kun". Returns '' when nothing usable remains.
 */
export function slugify(title: string, maxLength = SLUG_MAX_LENGTH): string {
  const ascii = title
    .toLowerCase()
    .replace(/[ßæœøđðłþı]/g, (char) => SPECIAL[char] ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length <= maxLength) return ascii;
  const cut = ascii.slice(0, maxLength);
  const boundary = cut.lastIndexOf('-');
  return (boundary > maxLength / 2 ? cut.slice(0, boundary) : cut).replace(/-+$/g, '');
}

/** Appends `-n` while keeping the result within the slug length limit. */
export function withSlugSuffix(base: string, n: number): string {
  const suffix = `-${n}`;
  const head = base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/g, '');
  return `${head}${suffix}`;
}
