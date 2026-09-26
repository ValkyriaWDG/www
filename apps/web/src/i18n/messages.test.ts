import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { csMessages, enMessages } from './messages';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') result.set(path, value);
    else for (const [nested, text] of flatten(value, path)) result.set(nested, text);
  }
  return result;
}

const cs = flatten(csMessages as unknown as Tree);
const en = flatten(enMessages as unknown as Tree);

describe('UI dictionaries', () => {
  it('have identical key sets in Czech and English', () => {
    const missingInCs = [...en.keys()].filter((key) => !cs.has(key));
    const missingInEn = [...cs.keys()].filter((key) => !en.has(key));
    expect({ missingInCs, missingInEn }).toEqual({ missingInCs: [], missingInEn: [] });
  });

  it('contain only non-empty strings that parse as ICU messages', () => {
    for (const [locale, map] of [
      ['cs', cs],
      ['en', en],
    ] as const) {
      for (const [key, text] of map) {
        expect(text.trim(), `${locale}:${key} is empty`).not.toBe('');
        expect(() => new IntlMessageFormat(text, locale), `${locale}:${key} is not valid ICU`).not.toThrow();
      }
    }
  });

  it('use the same ICU argument names in both languages', () => {
    const args = (text: string) => [...text.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)].map((m) => m[1]).sort();
    for (const [key, text] of en) {
      expect(args(cs.get(key) ?? ''), `argument mismatch for ${key}`).toEqual(args(text));
    }
  });

  it('keep Czech diacritics in the primary navigation labels', () => {
    expect(cs.get('common.nav.members')).toBe('ČLENOVÉ');
    expect(cs.get('common.nav.signIn')).toBe('PŘIHLÁSIT SE');
    expect(en.get('common.nav.news')).toBe('NEWS');
  });
});
