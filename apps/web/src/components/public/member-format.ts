/**
 * Initials for the avatar fallback: the first grapheme of the first two words, so emoji,
 * combining marks and surrogate pairs are never split. The display name itself is always
 * rendered exactly as stored; this is only a decorative placeholder.
 */
export function initialsOf(name: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const initials: string[] = [];
  for (const word of words) {
    const first = segmenter.segment(word)[Symbol.iterator]().next().value?.segment;
    if (!first) continue;
    initials.push(first.toLocaleUpperCase());
    if (initials.length === 2) break;
  }
  return initials.join('') || '?';
}
