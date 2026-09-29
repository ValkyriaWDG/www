import { expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';

/**
 * HLL map pack artwork (docs/assets/graphics-pack-2026-09-29.md) on the synthetic server
 * browser and the synthetic historical match. Alpha reports the accented public map name
 * "Sainte-Mère-Église"; Bravo's synthetic map and Charlie's missing map stay neutral.
 * Images never replace the textual map name, state or score.
 */

const decoded = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((images) => (images as HTMLImageElement[]).map((image) => (image.complete ? image.naturalWidth : -1)));

test.describe('HLL map artwork', () => {
  test('server rows show a map thumbnail only for a recognised map; the detail adds scene and on-demand tactical map', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await page.goto('/cs/hll/servers?server=synthetic-alpha');

    const alpha = page.getByRole('row').filter({ hasText: 'Test Server Alpha' });
    await expect(alpha).toContainText('Sainte-Mère-Église');
    const thumb = alpha.locator('img[data-map-thumb="sainte-mere-eglise"]');
    await expect(thumb).toHaveAttribute('alt', '');
    await expect(thumb).toHaveAttribute('src', '/images/hll/maps/sainte-mere-eglise/thumb-160x90.webp');
    await expect.poll(() => decoded(page, 'img[data-map-thumb]')).toEqual([160]);
    // Unknown synthetic map (stale) and missing map keep the neutral placeholder and their text.
    await expect(page.getByRole('row').filter({ hasText: 'Test Server Bravo' }).locator('img')).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'Test Server Bravo' })).toContainText('Synthetic Map South');
    await expect(page.getByRole('row').filter({ hasText: 'Test Server Charlie' })).toContainText('Mapa neznámá');
    const box = await alpha.locator('[aria-hidden="true"]').first().boundingBox();
    expect([Math.round(box!.width), Math.round(box!.height)]).toEqual([72, 40]);

    const detail = page.locator('section[aria-labelledby="server-detail-title"]');
    const scene = detail.locator('[data-map-scene="sainte-mere-eglise"] img');
    await expect(scene).toHaveAttribute('alt', 'Sainte-Mère-Église – herní scéna mapy (ilustrační, ne aktuální stav hry)');
    await expect.poll(() => scene.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(718);
    const tactical = detail.locator('[data-map-tactical="sainte-mere-eglise"]');
    await expect(tactical).toHaveAttribute('href', '/images/hll/maps/sainte-mere-eglise/tactical-1024.webp');
    await expect(tactical).toHaveText(/^Taktická mapa Sainte-Mère-Église \(WebP, \d{3} kB\)$/);
    // Map name, mode and live state remain HTML beside the illustration.
    await expect(detail.getByText('Warfare', { exact: true })).toBeVisible();
    await expect(page.locator('[data-server-score]')).toHaveText('Spojenci 3 : 2 Osa');
    // The tactical map is never requested until a visitor asks for it.
    expect(requests.filter((path) => path.includes('/tactical-'))).toEqual([]);
    const response = await page.request.get(await tactical.getAttribute('href') as string);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/webp');

    // English context; a server without a recognised map gets no scene.
    await page.goto('/en/hll/servers?server=synthetic-alpha');
    await expect(page.locator('[data-map-scene] img')).toHaveAttribute('alt', 'Sainte-Mère-Église — in-game scene of the map (illustrative, not the live game state)');
    await expect(page.locator('[data-map-tactical]')).toHaveText(/^Tactical map of Sainte-Mère-Église \(WebP, \d{3} kB\)$/);
    await page.goto('/en/hll/servers?server=synthetic-bravo');
    await expect(page.locator('#server-detail-title')).toContainText('Bravo');
    await expect(page.locator('[data-map-scene]')).toHaveCount(0);
  });

  test('a failed thumbnail decode leaves the row layout and text intact', async ({ page }) => {
    await page.route('**/images/hll/maps/**', (route) => route.fulfill({ status: 200, contentType: 'image/webp', body: 'not an image' }));
    await page.goto('/cs/hll/servers?server=synthetic-alpha');
    const alpha = page.getByRole('row').filter({ hasText: 'Test Server Alpha' });
    await expect(alpha).toContainText('Sainte-Mère-Église');
    await expect.poll(() => decoded(page, 'img[data-map-thumb]')).toEqual([0]);
    const box = await alpha.locator('[aria-hidden="true"]').first().boundingBox();
    expect([Math.round(box!.width), Math.round(box!.height)]).toEqual([72, 40]);
    // The detail scene keeps its reserved 3:1 box and localized alternative text.
    const scene = page.locator('[data-map-scene] img');
    const sceneBox = await scene.boundingBox();
    expect(Math.abs(sceneBox!.width / sceneBox!.height - 3)).toBeLessThan(0.03);
    await expect(scene).toHaveAttribute('alt', /^Sainte-Mère-Église – herní scéna mapy/);
  });

  test('the HLL match detail briefs each recognised round map once and keeps unknown maps as text', async ({ page }) => {
    const slug = FIXTURE_SLUGS.matches.hllHistorical;
    const requests: string[] = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await page.goto(`/cs/hll/matches/${slug}`);
    const briefing = page.locator('[data-match-maps] [data-map-scene]');
    await expect(briefing).toHaveCount(2);
    expect(await briefing.evaluateAll((items) => items.map((item) => item.getAttribute('data-map-scene')))).toEqual(['hurtgen-forest', 'sainte-mere-eglise']);
    await expect(briefing.first()).toContainText('Hürtgen Forest');
    await expect(briefing.first().locator('img')).toHaveAttribute('alt', 'Hürtgen Forest – herní scéna mapy (ilustrační)');
    await expect(briefing.first().locator('img')).toHaveAttribute('loading', 'lazy');
    const rows = page.locator('[data-match-rounds] table tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText('5 : 0');
    await expect(rows.nth(2)).toContainText('Synthetic Map D');
    // No published cover: the banner shows the first map's scene behind the team names.
    await expect(page.locator('[data-match-banner][data-banner-scene] img[src^="/images/hll/maps/"]')).toHaveAttribute('src', '/images/hll/maps/hurtgen-forest/scene-718x404.webp');
    expect(requests.filter((path) => path.includes('/tactical-'))).toEqual([]);

    await page.goto(`/en/hll/matches/${slug}`);
    await expect(page.locator('[data-match-maps] [data-map-tactical]').last()).toHaveText(/^Tactical map of Sainte-Mère-Église \(WebP, \d{3} kB\)$/);
  });

  for (const [path, width] of [
    ['/cs/hll/servers?server=synthetic-alpha', 390],
    ['/en/hll/servers?server=synthetic-alpha', 1024],
    [`/cs/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical}`, 390],
    [`/en/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical}`, 1366],
  ] as const) {
    test(`no horizontal overflow on ${path} at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.locator('[data-map-scene]').first()).toBeAttached();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  }
});
