import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import { FIXTURE_ASSET_IDS, FIXTURE_MANUAL_SLUGS, FIXTURE_SLUGS } from '../src/fixtures/data';

/**
 * Real shipped artwork, without synthetic media interception or visual masking.
 * E2E_HLL_EMPTY_MEDIA=1 pnpm test:e2e e2e/hll-artwork.spec.ts --project=chromium
 * Add CAPTURE_EVIDENCE=1 for six browser screenshots + three actual social PNGs.
 * Use a fresh test server/port: an existing server may still have synthetic clips.
 * Editorial records remain labelled disposable fixtures, never real clan events.
 */
test.skip(process.env.E2E_HLL_EMPTY_MEDIA !== '1', 'Requires the opt-in empty HLL playlist test server.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

const captureEvidence = process.env.CAPTURE_EVIDENCE === '1';
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/hll-graphics');
const captures: { file: string; caption: string; route: string; viewport?: string; kind: 'browser-screenshot' | 'social-png' }[] = [];
let browserVersion = '';

async function decoded(image: Locator, width?: number, height?: number) {
  await expect(image).toBeVisible();
  await image.scrollIntoViewIfNeeded();
  await image.evaluate(async (element: HTMLImageElement) => { await element.decode(); });
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  if (width) await expect(image).toHaveJSProperty('naturalWidth', width);
  if (height) await expect(image).toHaveJSProperty('naturalHeight', height);
}

async function recordShot(page: Page, file: string, caption: string) {
  if (!captureEvidence) return;
  mkdirSync(outDir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  // Decode only real, visible elements; no image replacement, CSS injection or masks.
  await page.evaluate(async () => {
    const visible = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
    });
    await Promise.all(visible.map((image) => image.decode()));
  });
  await page.screenshot({ path: path.join(outDir, file), animations: 'disabled', caret: 'hide' });
  const viewport = page.viewportSize()!;
  captures.push({ file, caption, route: new URL(page.url()).pathname + new URL(page.url()).search, viewport: `${viewport.width}x${viewport.height}`, kind: 'browser-screenshot' });
}

test.beforeAll(async ({ browser }) => { browserVersion = browser.version(); });
test.afterAll(() => {
  if (!captureEvidence) return;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'captions.json'), JSON.stringify({
    capturedAt: new Date().toISOString(), browser: `Chromium ${browserVersion}`,
    revision: process.env.EVIDENCE_REVISION ?? 'Local working tree; may contain uncommitted changes',
    environment: 'Local standalone production build with disposable PostgreSQL fixtures and an empty HLL video playlist',
    limitation: 'Real shipped HLL artwork; synthetic editorial content and results. No clan footage, production-data verification or live social-network unfurl.',
    captures,
  }, null, 2) + '\n');
});

test('the real static poster covers desktop and mobile viewports without video requests or playback controls', async ({ browser }) => {
  const variants = [
    { locale: 'cs', width: 1920, height: 1080 },
    { locale: 'en', width: 1366, height: 768 },
    { locale: 'cs', width: 390, height: 844 },
  ];
  for (const variant of variants) {
    const mobile = variant.width < 768;
    const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage();
      const mediaRequests: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'media' || /\.(mp4|webm|m3u8)(?:\?|$)/i.test(request.url()) || request.url().includes('/e2e-media/')) mediaRequests.push(request.url());
      });
      expect((await page.goto(`/${variant.locale}/hll`))?.status()).toBe(200);
      const scene = page.locator('[data-hll-scene]');
      await expect(scene).toHaveAttribute('data-hll-clip-count', '0');
      await expect(scene).toHaveAttribute('data-hll-stage-state', 'fallback');
      await expect(scene).toHaveAttribute('data-hll-stage-reason', 'no-clip');
      await expect(scene).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('video, [data-hll-stage-toggle], [data-hll-stage-poster]')).toHaveCount(0);
      const poster = page.locator('[data-hll-default-poster]');
      await expect(poster).toHaveAttribute('src', '/images/hll/scene-poster.webp');
      await decoded(poster, 1920, 1080);
      const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: innerHeight }));
      for (const layer of [scene, poster]) expect(await layer.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.waitForTimeout(500); // Observe the hydrated playback effect; absence is a network assertion.
      expect(mediaRequests).toEqual([]);
      await recordShot(page, `hll-landing-${variant.locale}-${variant.width}x${variant.height}.png`, `Actual HLL landing in ${variant.locale.toUpperCase()}: shipped full-viewport static game artwork and Valkyria menu. Empty video playlist; no video request or playback control. Teaser content is synthetic, not a clan event.`);
    } finally { await context.close(); }
  }
});

test('manual cards retain published CMS covers and use mapped art only when the cover is absent', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.goto('/cs/hll/field-manual');
  const publishedCategory = page.locator('[data-manual-category="getting-started"]');
  await expect(publishedCategory.locator('img')).toHaveAttribute('src', `/api/media/${FIXTURE_ASSET_IDS.newsCover}/thumb`);
  await decoded(publishedCategory.locator('img'));
  await expect(publishedCategory.locator('[data-decorative-artwork]')).toHaveCount(0);
  for (const [category, artwork] of [['roles', 'roles-and-equipment'], ['communication', 'communication'], ['vehicles', 'logistics-and-vehicles']]) {
    const image = page.locator(`[data-manual-category="${category}"] img`);
    await expect(image).toHaveAttribute('src', `/images/hll/${artwork}.webp`);
    await expect(image).toHaveAttribute('alt', '');
    await decoded(image, 1280, 720);
  }
  await expect(page.locator('[data-manual-category="spawns"]')).toHaveCount(0); // Draft-only fixtures stay private.
  await page.evaluate(() => scrollTo(0, 0));
  await recordShot(page, 'hll-manual-cs-1920x1200.png', 'Czech manual categories: the synthetic CMS fixture cover keeps priority for Getting started; Roles, Communication and Vehicles use real shipped decorative HLL artwork. Draft-only categories remain hidden.');

  await page.goto('/cs/hll/field-manual?category=getting-started');
  const publishedArticle = page.locator(`[data-manual-article="${FIXTURE_MANUAL_SLUGS.setupCs}"]`);
  await expect(publishedArticle.locator('img')).toHaveAttribute('src', `/api/media/${FIXTURE_ASSET_IDS.newsCover}/thumb`);
  await decoded(publishedArticle.locator('img'));
  await expect(publishedArticle.locator('[data-decorative-artwork]')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/hll/field-manual?category=communication');
  const fallbackArticle = page.locator(`[data-manual-article="${FIXTURE_MANUAL_SLUGS.calloutsEn}"]`);
  await expect(fallbackArticle.locator('img')).toHaveAttribute('src', '/images/hll/communication.webp');
  await decoded(fallbackArticle.locator('img'), 1280, 720);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await fallbackArticle.scrollIntoViewIfNeeded();
  await recordShot(page, 'hll-manual-en-390x844.png', 'English manual category on a 390 CSS-pixel viewport, scrolled to the synthetic callouts article: the missing editorial cover uses real shipped decorative teamwork artwork; no translated draft is substituted.');
});

test('HLL news artwork stays within HLL posts and never replaces published news covers', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.goto('/cs/hll/news');
  const hllCard = page.locator(`[data-news-card="${FIXTURE_SLUGS.news.listingCs[1]}"]`);
  await expect(hllCard).toHaveAttribute('data-news-scope', 'hell-let-loose');
  const image = hllCard.locator('img[src="/images/hll/news.webp"]');
  await decoded(image, 1280, 720);
  await expect(image.locator('..')).toHaveAttribute('aria-hidden', 'true');
  await decoded(hllCard.locator('img[src="/brand/valkyria-emblem-733.webp"]'), 733, 811);
  const community = page.locator(`[data-news-card="${FIXTURE_SLUGS.news.csOnly}"]`);
  await expect(community).toHaveAttribute('data-news-scope', 'community');
  await expect(community.locator('img[src^="/images/hll/"]')).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, 0));
  await recordShot(page, 'hll-news-cs-1920x1200.png', 'Czech HLL news with explicitly synthetic announcements: coverless HLL posts use real shipped scenery and a subdued clan crest. Shared community posts remain game-neutral; decorative artwork does not portray the announced event.');

  await page.goto('/cs/wardogs/news');
  await expect(page.locator('[data-news-card] img[src^="/images/hll/"]')).toHaveCount(0);
  const covered = page.locator(`[data-news-card="${FIXTURE_SLUGS.news.featureCs}"] img`);
  await expect(covered).toHaveAttribute('src', `/api/media/${FIXTURE_ASSET_IDS.newsCover}/thumb`);
  await decoded(covered);
  await expect(page.locator(`[data-news-card="${FIXTURE_SLUGS.news.listingCs[0]}"] img`)).toHaveAttribute('src', '/presskit/wardogs-fullmark-white.svg');
});

test('all delivered HLL images and actual social endpoints decode at their declared dimensions', async ({ request }) => {
  const covers = ['getting-started', 'objectives-and-modes', 'roles-and-equipment', 'communication', 'logistics-and-vehicles', 'armor-and-artillery', 'spawns-and-engineering', 'squad-leader-fieldcraft', 'news'];
  for (const name of [...covers, 'scene-poster']) {
    const response = await request.get(`/images/hll/${name}.webp`);
    expect(response.status(), name).toBe(200);
    expect(response.headers()['content-type'], name).toContain('image/webp');
    const { info } = await sharp(await response.body()).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height], name).toEqual(name === 'scene-poster' ? [1920, 1080] : [1280, 720]);
  }
  for (const [name, route] of [
    ['hll-site-cs', '/api/social/cs/site?game=hll'],
    ['hll-news-cs', `/api/social/cs/news/${FIXTURE_SLUGS.news.listingCs[1]}`],
    ['hll-result-en', `/api/social/en/matches/${FIXTURE_SLUGS.matches.hllHistorical}`],
  ]) {
    const response = await request.get(route!);
    expect(response.status(), route).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const bytes = await response.body();
    const { info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1200, 630]);
    if (captureEvidence) {
      mkdirSync(outDir, { recursive: true });
      const file = `${name}.png`;
      writeFileSync(path.join(outDir, file), bytes);
      captures.push({ file, route: route!, kind: 'social-png', caption: `Actual decoded 1200×630 PNG returned by ${route}. Shipped HLL artwork with synthetic editorial/result data where applicable; not a live social-network unfurl or clan match proof.` });
    }
  }
});
