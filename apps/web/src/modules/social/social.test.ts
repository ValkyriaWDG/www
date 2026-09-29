import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { ArticleDTO } from '@/modules/content/types';
import type { PublicMatchDetail } from '@/modules/matches/types';
import { articleCard, cardText, matchCard, parseSocialTarget, siteCard, socialImagePath, type SocialCard } from './model';
import { sharingMetadata } from './metadata';
import { renderSocialCard } from './render';
import { articleStructuredData, serializeStructuredData } from './structured-data';

const article = {
  isPreview: false, locale: 'cs', slug: 'verejny-clanek', revisionId: 'published-revision', title: 'Příliš žluťoučký kůň', excerpt: 'Zveřejněný souhrn',
  publishedAt: new Date('2026-09-26T12:00:00Z'), updatedAt: null, authorLabel: '', category: null, cover: null, game: 'wardogs',
} as ArticleDTO;
const match = {
  status: 'completed', result: null, opponentName: 'Synthetic Opponent', startsAt: '2026-09-26T17:00:00Z', timeZone: 'Europe/Prague',
  competitionName: null, game: 'wardogs', cover: null, rounds: [],
} as unknown as PublicMatchDetail;
const round = (mapName: string | null, ordinal = 1) => ({ ordinal, mapName, mode: null, side: null, scoreValkyria: null, scoreOpponent: null, outcome: null });
const withRounds = (value: PublicMatchDetail, ...maps: (string | null)[]) => ({ ...value, rounds: maps.map((map, index) => round(map, index + 1)) }) as PublicMatchDetail;

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
    expect(articleCard({ ...article, game: 'hell-let-loose' })).toMatchObject({ theme: 'hll', game: 'HELL LET LOOSE', map: null });
    expect(matchCard({ ...match, game: 'hell-let-loose' }, 'en')).toMatchObject({ theme: 'hll', score: null, map: null });
    expect(siteCard('cs', 'site', 'hll')).toMatchObject({ theme: 'hll', game: 'HELL LET LOOSE' });
    expect(siteCard('en', 'site', 'wardogs')).toMatchObject({ theme: 'wardogs', game: 'WARDOGS' });
    expect(siteCard('en')).toMatchObject({ theme: 'community', map: null });
    expect(articleCard({ ...article, game: null } as unknown as ArticleDTO)).toMatchObject({ theme: 'community', marks: [] });
    // Official marks replace the game-name text; a community article keeps its text label.
    expect(siteCard('cs', 'site', 'hll').marks).toEqual(['hll']);
    expect(siteCard('en').marks).toEqual(['wardogs', 'hll']);
    expect(articleCard(article).marks).toEqual(['wardogs']);
    expect(matchCard({ ...match, game: 'hell-let-loose' } as PublicMatchDetail, 'cs').marks).toEqual(['hll']);
    expect(articleCard(article).title).toBe(article.title);
  });

  it('keeps a real zero score apart from an unknown one', () => {
    const completed = (scoreValkyria: number | null, scoreOpponent: number | null, outcome: 'win' | 'loss' | 'draw' | 'unknown') =>
      matchCard({ ...match, result: { scoreValkyria, scoreOpponent, outcome, verification: 'verified' } } as PublicMatchDetail, 'en');
    expect(completed(0, 0, 'draw')).toMatchObject({ score: '0 : 0', status: 'Completed · Verified result' });
    expect(completed(5, 0, 'win')).toMatchObject({ score: '5 : 0' });
    expect(completed(0, 5, 'loss')).toMatchObject({ score: '0 : 5' });
    expect(completed(0, null, 'loss')).toMatchObject({ score: null, status: 'Loss · Verified result' });
    expect(completed(null, null, 'unknown')).toMatchObject({ score: null, status: 'Result not published yet' });
  });

  it('briefs an HLL match on its first recognised map and never guesses one', () => {
    const hll = { ...match, game: 'hell-let-loose' } as PublicMatchDetail;
    expect(matchCard(withRounds(hll, 'carentan_warfare_night', 'Foy'), 'cs').map).toEqual({ name: 'Carentan', slug: 'carentan' });
    expect(matchCard(withRounds(hll, null, 'Synthetic Map A', 'Sainte-Mère-Église'), 'en').map).toEqual({ name: 'St. Mere Eglise', slug: 'sainte-mere-eglise' });
    expect(matchCard(withRounds(hll, 'carentanTypo', 'Synthetic Map A'), 'en').map).toBeNull();
    expect(matchCard(withRounds(match, 'Carentan'), 'en').map).toBeNull();
  });

  it('bounds long headings and versions both metadata image families identically', () => {
    expect(cardText('Ž'.repeat(200)).replaceAll('\u200b', '').length).toBe(130);
    expect(cardText('A\n\t  B')).toBe('A B');
    const metadata = sharingMetadata('en', 'news', 'news-title', 'r2', 'Public title');
    expect(metadata.twitter.card).toBe('summary_large_image');
    expect(metadata.twitter.images[0]).toEqual(metadata.images[0]);
    expect(metadata.images[0]).toMatchObject({ width: 1200, height: 630, url: '/api/social/en/news/news-title?v=3-r2' });
    expect(socialImagePath('cs')).toBe('/api/social/cs/site?v=3');
    expect(sharingMetadata('cs', 'site', undefined, undefined, 'HLL', undefined, 'hll').images[0]).toMatchObject({ url: '/api/social/cs/site?v=3&game=hll' });
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
    const hll = { ...match, game: 'hell-let-loose' } as PublicMatchDetail;
    const cards = [
      articleCard({ ...article, game: 'hell-let-loose' }),
      matchCard({ ...hll, status: 'scheduled' }, 'en'),
      matchCard({ ...hll, result: { scoreValkyria: 3, scoreOpponent: 2, outcome: 'win', verification: 'verified' } }, 'cs'),
      matchCard(withRounds({ ...hll, result: { scoreValkyria: 0, scoreOpponent: 0, outcome: 'draw', verification: 'verified' } }, 'Hürtgen Forest'), 'cs'),
    ];
    cards.push(articleCard({ ...article, game: 'hell-let-loose', title: 'Příliš žluťoučký kůň úpěl ďábelské ódy: dlouhý titulek novinky o sobotní akci na serveru Valkyria' }));
    for (const [index, card] of cards.entries()) {
      const png = await renderSocialCard(card, null, 'valkyria.cz');
      // Opt-in evidence export of the rendered PNGs (not written in normal runs).
      if (process.env.SOCIAL_CAPTURE_DIR) writeFileSync(path.join(process.env.SOCIAL_CAPTURE_DIR, `renderer-hll-${index + 1}.png`), png);
      expect(await sharp(png).metadata()).toMatchObject({ width: 1200, height: 630, format: 'png' });
      expect(png.length).toBeLessThan(1_000_000);
      const { data } = await sharp(png).extract({ left: 600, top: 1, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([...data]).toEqual([197, 185, 103]);
    }
  });

  it('shows the game scene on the right and keeps the text side dark', async () => {
    const stats = async (card: SocialCard, region: { left: number; top: number; width: number; height: number }) => {
      const png = await renderSocialCard(card, null, 'valkyria.cz');
      return sharp(await sharp(png).extract(region).removeAlpha().png().toBuffer()).stats();
    };
    for (const card of [siteCard('cs', 'site', 'hll'), siteCard('en', 'site', 'wardogs'), siteCard('cs'), matchCard(withRounds({ ...match, game: 'hell-let-loose' } as PublicMatchDetail, 'Foy'), 'en')]) {
      const text = await stats(card, { left: 2, top: 200, width: 40, height: 280 });
      const art = await stats(card, { left: 800, top: 200, width: 300, height: 200 });
      // The illustration/map scene has detail (variance); the text column is a flat dark shade.
      expect(Math.max(...art.channels.map((channel) => channel.stdev)), card.theme).toBeGreaterThan(12);
      expect(Math.max(...text.channels.map((channel) => channel.mean)), card.theme).toBeLessThan(60);
    }
  });

  it('draws the official game marks in the header, and text only without a mark', async () => {
    const header = async (card: SocialCard) => {
      const png = await renderSocialCard(card, null, 'valkyria.cz');
      const { data, info } = await sharp(png).extract({ left: 700, top: 40, width: 456, height: 50 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let bright = 0;
      let firstColumn = info.width;
      for (let i = 0; i < data.length; i += 3) {
        if (data[i]! > 220 && data[i + 1]! > 220 && data[i + 2]! > 220) {
          bright++;
          firstColumn = Math.min(firstColumn, (i / 3) % info.width);
        }
      }
      return { bright, firstColumn };
    };
    const hll = await header(siteCard('cs', 'site', 'hll'));
    const both = await header(siteCard('cs'));
    const text = await header(articleCard({ ...article, game: null } as unknown as ArticleDTO));
    expect(hll.bright).toBeGreaterThan(400);
    // Two marks with a divider reach further left than one.
    expect(both.firstColumn).toBeLessThan(hll.firstColumn - 100);
    // The community article keeps its small text label (few bright pixels).
    expect(text.bright).toBeLessThan(hll.bright);
  });

  it('keeps a published cover framed and uncropped instead of the default scene or map', async () => {
    const cover = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#d03020' } }).png().toBuffer();
    const card = matchCard(withRounds({ ...match, game: 'hell-let-loose', cover: { assetId: 'a' } } as unknown as PublicMatchDetail, 'Foy'), 'en');
    const png = await renderSocialCard(card, cover, 'valkyria.cz');
    const pixel = async (left: number, top: number) => [...(await sharp(png).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer())];
    expect(await pixel(968, 326)).toEqual([208, 48, 32]);
    // Outside the frame there is no photographic scene, only the theme gradient.
    const { channels } = await sharp(await sharp(png).extract({ left: 700, top: 520, width: 450, height: 30 }).removeAlpha().png().toBuffer()).stats();
    expect(Math.max(...channels.map((channel) => channel.stdev))).toBeLessThan(6);
  });
});
