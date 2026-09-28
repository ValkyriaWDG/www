import { expect, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';

test.describe('public sharing and homepage SEO', () => {
  test('robots uses the standalone runtime origin instead of the build origin', async ({ request, baseURL }, testInfo) => {
    // The production artifact must remain portable: CI builds and serves at different origins.
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    const cacheControl = response.headers()['cache-control'];
    await testInfo.attach('robots-response', {
      body: JSON.stringify({ runtimeOrigin: baseURL, status: response.status(), cacheControl, body }, null, 2),
      contentType: 'application/json',
    });
    const directives = body.split(/\r?\n/).filter(Boolean);
    expect(directives).toContain(`Host: ${baseURL}`);
    expect(directives).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
    expect(directives).toContain('Allow: /');
    expect(directives).toContain('Allow: /api/social/');
    for (const route of ['/api/', '/cs/admin', '/en/admin', '/cs/account', '/en/account', '/cs/login', '/en/login']) {
      expect(directives).toContain(`Disallow: ${route}`);
    }
    // Next's dynamic text metadata handler requires revalidation instead of caching a build response.
    expect(cacheControl).toBe('public, max-age=0, must-revalidate');
  });

  for (const locale of ['cs', 'en']) {
    test(`${locale} homepage has one self-canonical and reciprocal languages`, async ({ page, baseURL }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/${locale}`);
      for (const alternate of ['cs', 'en']) await expect(page.locator(`link[hreflang="${alternate}"]`)).toHaveAttribute('href', `${baseURL}/${alternate}`);
      await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute('href', `${baseURL}/cs`);
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', locale === 'cs' ? 'cs_CZ' : 'en_GB');
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${baseURL}/api/social/${locale}/site?v=2`);
    });
  }

  test('published article shares the same branded PNG through OG/Twitter/JSON-LD', async ({ page, request }) => {
    await page.goto(`/cs/news/${FIXTURE_SLUGS.news.featureCs}`);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toContain(`/api/social/cs/news/${FIXTURE_SLUGS.news.featureCs}?v=2-`);
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
      `cs/matches/${FIXTURE_SLUGS.matches.draft}`, 'de/site', 'cs/admin', 'cs/site/extra', 'cs/news/a/b', 'cs/site?game=unknown',
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

  test('game landing pages advertise their own sharing artwork', async ({ page, request, baseURL }) => {
    for (const game of ['hll', 'wardogs']) {
      await page.goto(`/cs/${game}`);
      const url = `${baseURL}/api/social/cs/site?v=2&game=${game}`;
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', url);
      await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', url);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${baseURL}/cs/${game}`);
      const response = await request.get(url);
      expect(response.status()).toBe(200);
      expect((await response.body()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  });

  for (const locale of ['cs', 'en']) {
    test(`${locale} game collections retain game scope in sharing metadata`, async ({ page, baseURL }) => {
      for (const game of ['hll', 'wardogs']) {
        for (const section of ['news', 'matches']) {
          await page.goto(`/${locale}/${game}/${section}`);
          const url = `${baseURL}/api/social/${locale}/${section}?v=2&game=${game}`;
          await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', url);
          await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', url);
        }
      }
    });
  }
});
