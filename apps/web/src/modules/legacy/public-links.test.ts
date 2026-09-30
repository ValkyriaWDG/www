import { describe, expect, it, vi } from 'vitest';
import type { RichTextDocument } from '@/modules/content/rich-text/schema';
import { legacyLinkRewrite, legacyLinkTargets } from './public-links';

const getDb = vi.fn(() => ({}));
vi.mock('@/lib/db', () => ({ getDb: () => getDb() }));
vi.mock('./resolve-public-url', () => ({
  resolvePublishedLegacyHllUrl: async (_db: unknown, path: string, locale: string) => {
    if (path === '/clanky/synthetic-unavailable') throw new Error('synthetic database outage');
    return path === '/clanky/synthetic-report' && locale === 'cs' ? '/cs/hll/news/synthetic-report' : null;
  },
}));

const link = (text: string, href: string) => ({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] });
const doc = (...content: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [link('servery', 'https://www.valkyriahll.cz/servery')] }] }] }] }) as unknown as RichTextDocument;

describe('former website links in public rich text', () => {
  it('finds every former-website link, including nested ones, once', () => {
    const body = doc(link('report', 'https://valkyriahll.cz/clanky/synthetic-report'), link('again', 'https://valkyriahll.cz/clanky/synthetic-report'), link('other', 'https://example.org/'));
    expect(legacyLinkTargets(body)).toEqual(['https://valkyriahll.cz/clanky/synthetic-report', 'https://www.valkyriahll.cz/servery']);
  });

  it('points them to on-site pages in the page locale or drops the link, leaving other links alone', async () => {
    const rewrite = (await legacyLinkRewrite(doc(link('report', 'https://valkyriahll.cz/clanky/synthetic-report'), link('rank', 'https://valkyriahll.cz/zebricky'), link('file', 'https://valkyriahll.cz/storage/a.png')), 'en'))!;
    expect(rewrite('https://www.valkyriahll.cz/servery')).toBe('/en/hll/servers');
    // English falls back to the Czech article, which is all the former website had.
    expect(rewrite('https://valkyriahll.cz/clanky/synthetic-report')).toBe('/cs/hll/news/synthetic-report');
    expect(rewrite('https://valkyriahll.cz/zebricky')).toBeNull();
    expect(rewrite('https://valkyriahll.cz/storage/a.png')).toBeNull();
    expect(rewrite('https://example.org/')).toBe('https://example.org/');
  });

  it('keeps only the text when a lookup fails instead of breaking the page', async () => {
    const rewrite = (await legacyLinkRewrite(doc(link('report', 'https://valkyriahll.cz/clanky/synthetic-unavailable')), 'cs'))!;
    expect(rewrite('https://valkyriahll.cz/clanky/synthetic-unavailable')).toBeNull();
    expect(rewrite('https://www.valkyriahll.cz/servery')).toBe('/cs/hll/servers');
  });

  it('does not touch the database when a document has no former-website link', async () => {
    getDb.mockClear();
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [link('other', 'https://example.org/')] }] } as unknown as RichTextDocument;
    expect(await legacyLinkRewrite(body, 'cs')).toBeUndefined();
    expect(getDb).not.toHaveBeenCalled();
  });
});
