/** Letters that Unicode decomposition does not reduce to ASCII. */
const SPECIAL: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * URL slug with Czech/Slovak transliteration (`Žluťoučký kůň` → `zlutoucky-kun`).
 * Emoji and punctuation are dropped; the result may be empty for symbol-only input.
 */
export function slugify(input: string, maxLength = 80): string {
  const ascii = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}+/gu, '')
    .replace(/[ßæœøłđðþı]/g, (c) => SPECIAL[c] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length <= maxLength) return ascii;
  const cut = ascii.slice(0, maxLength);
  const boundary = cut.lastIndexOf('-');
  return (boundary > maxLength / 2 ? cut.slice(0, boundary) : cut).replace(/-+$/g, '');
}

/**
 * Returns the first free candidate (`base`, `base-2`, …). `taken` receives all
 * candidates at once and returns those already reserved. The database unique
 * constraint remains the final guard against concurrent reservations.
 */
export async function firstFreeSlug(base: string, maxLength: number, taken: (candidates: string[]) => Promise<Set<string>>): Promise<string> {
  const candidates = [base];
  for (let n = 2; n <= 30; n += 1) {
    const suffix = `-${n}`;
    candidates.push(`${base.slice(0, maxLength - suffix.length).replace(/-+$/g, '')}${suffix}`);
  }
  const reserved = await taken(candidates);
  const free = candidates.find((candidate) => !reserved.has(candidate));
  if (free) return free;
  const random = `-${Math.random().toString(36).slice(2, 8)}`;
  return `${base.slice(0, maxLength - random.length).replace(/-+$/g, '')}${random}`;
}
