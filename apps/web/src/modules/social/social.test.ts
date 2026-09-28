import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { ArticleDTO } from '@/modules/content/types';
import type { PublicMatchDetail } from '@/modules/matches/types';
import { articleCard, cardText, matchCard, parseSocialTarget, siteCard, socialImagePath } from './model';
import { sharingMetadata } from './metadata';
import { renderSocialCard } from './render';
import { articleStructuredData, serializeStructuredData } from './structured-data';

const article = {
  isPreview: false, locale: 'cs', slug: 'verejny-clanek', revisionId: 'published-revision', title: 'Příliš žluťoučký kůň', excerpt: 'Zveřejněný souhrn',
  publishedAt: new Date('2026-09-26T12:00:00Z'), updatedAt: null, authorLabel: '', category: null, cover: null, game: 'wardogs',
} as ArticleDTO;
const match = {
  status: 'completed', result: null, opponentName: 'Synthetic Opponent', startsAt: '2026-09-26T17:00:00Z', timeZone: 'Europe/Prague',
  competitionName: null, game: 'wardogs', cover: null,
} as PublicMatchDetail;

describe('social image publication and presentation contract', () => {
  it('allows only fixed locales, templates and bounded entity slugs', () => {
    expect(parseSocialTarget('cs', 'news', ['clanek'])).toEqual({ locale: 'cs', kind: 'news', slug: 'clanek' });
    for (const params of [['de', 'site', []], ['en', 'admin', []], ['cs', 'site', ['x']], ['cs', 'news', ['..']], ['en', 'news', ['a', 'b']], ['en', 'news', ['a'.repeat(161)]]] as const) {
      expect(parseSocialTarget(params[0], params[1], [...params[2]])).toBeNull();
    }
  });

  it('does not invent scores or use Wardogs illustration for HLL articles', () => {
    expect(matchCard(match, 'en')).toMatchObject({ score: null, status: 'Result not published yet' });
    const result = { scoreValkyria: 2, scoreOpponent: 0, outcome: 'win', verification: 'provisional' } as const;
    expect(matchCard({ ...match, result }, 'cs')).toMatchObject({ score: '2 : 0', status: 'Dohráno · Předběžný výsledek' });
    expect(matchCard({ ...match, result, status: 'cancelled' }, 'en')).toMatchObject({ score: null, status: 'Cancelled' });
    expect(articleCard({ ...article, game: 'hell-let-loose' })).toMatchObject({ artwork: 'hll-scene', game: 'HELL LET LOOSE' });
    expect(matchCard({ ...match, game: 'hell-let-loose' }, 'en')).toMatchObject({ artwork: 'hll-scene', score: null });
    expect(siteCard('cs', 'site', 'hll')).toMatchObject({ artwork: 'hll-scene', game: 'HELL LET LOOSE' });
    expect(siteCard('en', 'site', 'wardogs')).toMatchObject({ artwork: 'flying', game: 'WARDOGS' });
    expect(siteCard('en')).toMatchObject({ artwork: 'brand' });
    expect(articleCard(article).title).toBe(article.title);
  });

  it('bounds long headings and versions both metadata image families identically', () => {
    expect(cardText('Ž'.repeat(200)).replaceAll('\u200b', '').length).toBe(130);
    expect(cardText('A\n\t  B')).toBe('A B');
    const metadata = sharingMetadata('en', 'news', 'news-title', 'r2', 'Public title');
    expect(metadata.twitter.card).toBe('summary_large_image');
    expect(metadata.twitter.images[0]).toEqual(metadata.images[0]);
    expect(metadata.images[0]).toMatchObject({ width: 1200, height: 630, url: '/api/social/en/news/news-title?v=2-r2' });
    expect(socialImagePath('cs')).toBe('/api/social/cs/site?v=2');
    expect(sharingMetadata('cs', 'site', undefined, undefined, 'HLL', undefined, 'hll').images[0]).toMatchObject({ url: '/api/social/cs/site?v=2&game=hll' });
  });

  it('outputs published JSON-LD only and cannot close its script element', () => {
    expect(articleStructuredData({ ...article, isPreview: true }, 'https://site.example')).toBeNull();
    expect(articleStructuredData({ ...article, publishedAt: null }, 'https://site.example')).toBeNull();
    const data = articleStructuredData({ ...article, title: '</script><script>alert(1)</script>' }, 'https://site.example');
    expect(data).toMatchObject({ '@type': 'BlogPosting', url: 'https://site.example/cs/wardogs/news/verejny-clanek', inLanguage: 'cs-CZ' });
    const serialized = serializeStructuredData(data);
    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toEqual(data);
  });

  it('renders a real 1200×630 PNG with Czech glyphs and no external fetch', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network is forbidden in image rendering'));
    try {
      const png = await renderSocialCard({ ...siteCard('cs'), title: 'Příliš žluťoučký kůň 🐺 中文' }, null, 'valkyriawdg.cz');
      expect(await sharp(png).metadata()).toMatchObject({ width: 1200, height: 630, format: 'png' });
      expect(png.length).toBeLessThan(1_000_000);
      // Yoga may initialize its embedded WASM using a data: fetch. It is not network I/O.
      expect(fetch.mock.calls.map(([url]) => new URL(String(url)).protocol).filter((protocol) => protocol !== 'data:')).toEqual([]);
    } finally { fetch.mockRestore(); }
  });

  it('renders HLL news, fixture and result cards from local artwork with khaki theme', async () => {
    const cards = [
      articleCard({ ...article, game: 'hell-let-loose' }),
      matchCard({ ...match, game: 'hell-let-loose', status: 'scheduled' }, 'en'),
      matchCard({ ...match, game: 'hell-let-loose', result: { scoreValkyria: 3, scoreOpponent: 2, outcome: 'win', verification: 'verified' } }, 'cs'),
    ];
    for (const card of cards) {
      const png = await renderSocialCard(card, null, 'valkyria.cz');
      expect(await sharp(png).metadata()).toMatchObject({ width: 1200, height: 630, format: 'png' });
      const { data } = await sharp(png).extract({ left: 600, top: 1, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([...data]).toEqual([197, 185, 103]);
    }
  });
});
