import { expect, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';

test.describe('public sharing and homepage SEO', () => {
  for (const locale of ['cs', 'en']) {
    test(`${locale} homepage has one self-canonical and reciprocal languages`, async ({ page, baseURL }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/${locale}`);
      for (const alternate of ['cs', 'en']) await expect(page.locator(`link[hreflang="${alternate}"]`)).toHaveAttribute('href', `${baseURL}/${alternate}`);
      await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute('href', `${baseURL}/cs`);
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', locale === 'cs' ? 'cs_CZ' : 'en_GB');
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${baseURL}/api/social/${locale}/site?v=1`);
    });
  }

  test('published article shares the same branded PNG through OG/Twitter/JSON-LD', async ({ page, request }) => {
    await page.goto(`/cs/news/${FIXTURE_SLUGS.news.featureCs}`);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toContain(`/api/social/cs/news/${FIXTURE_SLUGS.news.featureCs}?v=1-`);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', og!);
    const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '{}');
    expect(data['@type']).toBe('BlogPosting');
    expect(data.headline).toBe('[Ukázka] Obrázky, tabulka a odkazy');
    expect(data.image).toBe(og);
    const image = await request.get(og!);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/png');
    expect(image.headers()['cache-control']).toContain('no-store');
    expect((await image.body()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const conditional = await request.get(og!, { headers: { 'If-None-Match': '*' } });
    expect(conditional.status()).toBe(200);
    expect(await conditional.body()).toEqual(await image.body());
  });

  test('unpublished/draft/wrong-locale entities cannot be rendered through image URLs', async ({ request }) => {
    for (const path of [
      `cs/news/${FIXTURE_SLUGS.news.scheduledCs}`, `cs/news/${FIXTURE_SLUGS.news.archivedCs}`,
      `en/news/${FIXTURE_SLUGS.news.withEnDraftEn}`, `en/news/${FIXTURE_SLUGS.news.csOnly}`,
      `cs/matches/${FIXTURE_SLUGS.matches.draft}`, 'de/site', 'cs/admin', 'cs/site/extra', 'cs/news/a/b',
    ]) {
      const response = await request.get(`/api/social/${path}`);
      expect(response.status(), path).toBe(404);
      expect(response.headers()['cache-control']).toBe('no-store');
    }
  });

  test('both site/list templates and published match templates are real PNGs', async ({ request }) => {
    for (const path of ['cs/site', 'en/site', 'cs/news', 'en/matches', `cs/matches/${FIXTURE_SLUGS.matches.completedUnknown}`, `en/matches/${FIXTURE_SLUGS.matches.completedVerified}`]) {
      const response = await request.get(`/api/social/${path}`);
      expect(response.status(), path).toBe(200);
      expect((await response.body()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
    await expect((await request.get('/robots.txt')).text()).resolves.toContain('Allow: /api/social/');
  });
});
