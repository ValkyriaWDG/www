import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import { FIXTURE_SLUGS } from '../src/fixtures/data';

/**
 * Captioned screenshots of the graphics-pack integration (map artwork and sharing cards)
 * for PR/issue evidence. Opt-in only:
 *   CAPTURE_EVIDENCE=1 pnpm exec playwright test e2e/visual-graphics-pack.spec.ts --project=chromium
 * Output: <repo>/.local/evidence/graphics-pack/ (gitignored) + captures.json. Synthetic
 * fixtures: server Alpha reports the public map name "Sainte-Mère-Église"; the synthetic
 * historical HLL match has rounds on Hürtgen Forest, Sainte-Mère-Église and a synthetic map.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture graphics-pack screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/graphics-pack');
const captures: { file: string; caption: string; route: string; viewport: string; locale: string; kind: 'browser-screenshot' | 'social-png' }[] = [];
const MATCH = FIXTURE_SLUGS.matches.hllHistorical;

type Shot = {
  file: string;
  caption: string;
  locale: 'cs' | 'en';
  path: string;
  width: number;
  height: number;
  fullPage?: boolean;
  /** Element scrolled to the top of the viewport before the capture. */
  scrollTo?: string;
  prepare?: (page: Page) => Promise<void>;
};

async function capture(browser: Browser, shot: Shot) {
  const mobile = shot.width < 768;
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    locale: shot.locale === 'cs' ? 'cs-CZ' : 'en-GB',
    timezoneId: 'Europe/Prague',
  });
  const page = await context.newPage();
  await shot.prepare?.(page);
  const response = await page.goto(shot.path);
  expect(response?.status(), shot.path).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  if (shot.scrollTo) {
    await page.locator(shot.scrollTo).first().evaluate((element) => {
      const header = document.querySelector('header');
      window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - (header?.getBoundingClientRect().height ?? 0) - 16);
    });
  }
  if (shot.fullPage) {
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      window.scrollTo(0, 0);
    });
  }
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => [...document.images].filter((image) => image.getClientRects().length > 0 && image.loading !== 'lazy').every((image) => image.complete));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, shot.file), animations: 'disabled', caret: 'hide', fullPage: shot.fullPage ?? false });
  captures.push({ file: shot.file, caption: shot.caption, route: shot.path, viewport: `${shot.width}x${shot.height}${shot.fullPage ? ' (full page)' : ''}`, locale: shot.locale, kind: 'browser-screenshot' });
  await context.close();
}

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

const brokenMaps = async (page: Page) => {
  await page.route('**/images/hll/maps/**', (route) => route.fulfill({ status: 200, contentType: 'image/webp', body: 'not an image' }));
};

const SHOTS: Shot[] = [
  {
    file: 'servers-alpha-cs-1920x1080.png',
    caption: 'Server browser /cs/hll/servers?server=synthetic-alpha: the recognised map (accented "Sainte-Mère-Église") gets a 160×90 scene thumbnail in its row and a 3:1 crop of the 718×404 scene at the top of the selected-server detail with a Czech alt text and an on-demand tactical-map link with its size; map, mode, score, teams and freshness stay HTML. Bravo (synthetic map, stale) and Charlie (no map) keep the neutral placeholder.',
    locale: 'cs',
    path: '/cs/hll/servers?server=synthetic-alpha',
    width: 1920,
    height: 1080,
  },
  {
    file: 'servers-alpha-en-1366x768.png',
    caption: 'The same selection in English at 1366×768 (/en/hll/servers?server=synthetic-alpha): English labels and tactical-map link text; layout and live state unchanged.',
    locale: 'en',
    path: '/en/hll/servers?server=synthetic-alpha',
    width: 1366,
    height: 768,
  },
  {
    file: 'servers-bravo-unknown-cs-1366x768.png',
    caption: 'Unknown map and stale observation (/cs/hll/servers?server=synthetic-bravo): "Synthetic Map South" is not a recognised map, so the row and detail show no artwork (never another map); the stale badge and missing round progress are unchanged.',
    locale: 'cs',
    path: '/cs/hll/servers?server=synthetic-bravo',
    width: 1366,
    height: 768,
  },
  {
    file: 'servers-failed-decode-cs-1366x768.png',
    caption: 'Failed image decode (map images answered with invalid bytes by a test route): the row keeps its 72×40 neutral box and the map name; the detail keeps the reserved 3:1 box with the Czech alt text; no layout shift or overflow.',
    locale: 'cs',
    path: '/cs/hll/servers?server=synthetic-alpha',
    width: 1366,
    height: 768,
    prepare: brokenMaps,
  },
  {
    file: 'servers-list-cs-390x844.png',
    caption: 'Phone list /cs/hll/servers at 390×844: thumbnails fit the existing 72×40 slot beside long server names; no horizontal overflow.',
    locale: 'cs',
    path: '/cs/hll/servers',
    width: 390,
    height: 844,
  },
  {
    file: 'servers-alpha-en-390x844.png',
    caption: 'Phone detail /en/hll/servers?server=synthetic-alpha at 390×844 (full page): back link, scene with English alt text and tactical-map link above the metadata, then connect details.',
    locale: 'en',
    path: '/en/hll/servers?server=synthetic-alpha',
    width: 390,
    height: 844,
    fullPage: true,
  },
  {
    file: 'match-top-cs-1920x1080.png',
    caption: `HLL match detail /cs/hll/matches/${MATCH} (no published cover): the banner shows the first recognised round map (Hürtgen Forest) behind VALKYRIA vs SHF under a scrim; result and metadata unchanged.`,
    locale: 'cs',
    path: `/cs/hll/matches/${MATCH}`,
    width: 1920,
    height: 1080,
  },
  {
    file: 'match-maps-cs-1920x1080.png',
    caption: `"Mapy a kola" of the same match: each recognised map once in round order (Hürtgen Forest, Sainte-Mère-Église) with its name and tactical-map link; the rounds table keeps the textual maps, the real 5 : 0 score and the synthetic third map without artwork.`,
    locale: 'cs',
    path: `/cs/hll/matches/${MATCH}`,
    width: 1920,
    height: 1080,
    scrollTo: '[data-match-rounds]',
  },
  {
    file: 'match-maps-en-1366x768.png',
    caption: `"Maps and rounds" in English (/en/hll/matches/${MATCH}, 1366×768): English alt text and tactical-map labels; accented map names unchanged.`,
    locale: 'en',
    path: `/en/hll/matches/${MATCH}`,
    width: 1366,
    height: 768,
    scrollTo: '[data-match-rounds]',
  },
  {
    file: 'match-cs-390x844.png',
    caption: `Phone match detail /cs/hll/matches/${MATCH} at 390×844 (full page): banner scene, map cards stacked one per row above the horizontally scrollable rounds table; no page overflow.`,
    locale: 'cs',
    path: `/cs/hll/matches/${MATCH}`,
    width: 390,
    height: 844,
    fullPage: true,
  },
  {
    file: 'match-maps-en-390x844.png',
    caption: `Phone "Maps and rounds" in English (/en/hll/matches/${MATCH}, 390×844).`,
    locale: 'en',
    path: `/en/hll/matches/${MATCH}`,
    width: 390,
    height: 844,
    scrollTo: '[data-match-rounds]',
  },
];

for (const shot of SHOTS) {
  test(`capture ${shot.file}`, async ({ browser }) => {
    await capture(browser, shot);
  });
}

const SOCIAL: [string, string, string][] = [
  ['social-hll-site-cs.png', '/api/social/cs/site?v=3&game=hll', 'HLL landing sharing card (cs): full-bleed text-free pack scene (hll-infantry) with the left text column darkened, khaki accent, "VALKYRIA ILLUSTRATION • NOT A GAME SCREENSHOT" label in Czech, canonical host.'],
  ['social-wardogs-site-en.png', '/api/social/en/site?v=3&game=wardogs', 'Wardogs landing sharing card (en): pack scene wdg-blue, amber accent, English copy.'],
  ['social-community-site-cs.png', '/api/social/cs/site?v=3', 'Shared community card (cs): the owner-selected PR #69 hub cover as background (no duplicate asset).'],
  ['social-hll-match-cs.png', `/api/social/cs/matches/${MATCH}?v=3`, 'Published HLL match (cs): first recognised round map Hürtgen Forest — subdued tactical background, framed in-game scene, "MAPA HURTGEN FOREST • HERNÍ SCÉNA"; published synthetic 3 : 2 result.'],
  ['social-hll-match-en.png', `/api/social/en/matches/${MATCH}?v=3`, 'The same match in English: "MATCH RESULT", "MAP HURTGEN FOREST • IN-GAME SCENE".'],
  ['social-wardogs-news-cover-cs.png', `/api/social/cs/news/${FIXTURE_SLUGS.news.featureCs}?v=3`, 'Published article with a published cover (cs): the cover stays framed and uncropped; no scene is added behind it.'],
];

test('capture actual sharing PNGs', async ({ request }) => {
  for (const [file, route, caption] of SOCIAL) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    const png = await response.body();
    expect(await sharp(png).metadata()).toMatchObject({ width: 1200, height: 630, format: 'png' });
    writeFileSync(path.join(outDir, file), png);
    captures.push({ file, caption: `${caption} Actual PNG returned by ${route}.`, route, viewport: '1200x630', locale: route.split('/')[3]!, kind: 'social-png' });
  }
});
