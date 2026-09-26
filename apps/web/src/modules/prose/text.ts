/*
 * Pure text helpers shared by the community input schemas. No server or database
 * dependencies, so validation schemas stay importable from client form code.
 */

/** Counts Unicode code points (PostgreSQL `length()` semantics for UTF-8 text). */
export function codePointLength(value: string): number {
  return [...value].length;
}

/** Detects C0/C1 control characters, which single-line display text never needs. */
export function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f]/.test(value);
}

/** Lower-cases and strips diacritics so `Čech` matches `cech` in search. */
export function foldSearchTerm(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Escapes LIKE metacharacters (PostgreSQL default escape is backslash). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
