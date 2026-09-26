import { expect, test } from '@playwright/test';

test.describe('locale routing contract', () => {
  test('bare root always redirects to Czech, even for an English browser', async ({ request }) => {
    const response = await request.get('/', {
      maxRedirects: 0,
      headers: { 'Accept-Language': 'en-GB,en;q=0.9', Cookie: 'NEXT_LOCALE=en' },
    });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location!, 'http://x').pathname).toBe('/cs');
  });

  test('unprefixed known routes redirect to Czech and drop unsafe query parameters', async ({ request }) => {
    const response = await request.get('/matches?game=wardogs&returnTo=https://evil.example', { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/cs\/matches\?game=wardogs$/);
  });

  test('unsupported explicit locales and unknown routes are not found', async ({ request }) => {
    expect((await request.get('/de/news', { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.get('/cs/definitely-not-a-page')).status()).toBe(404);
    expect((await request.get('/wp-login.php', { maxRedirects: 0 })).status()).toBe(404);
  });

  test('infrastructure routes stay unprefixed', async ({ request }) => {
    const live = await request.get('/api/health/live', { maxRedirects: 0 });
    expect(live.status()).toBe(200);
    const ready = await request.get('/api/health/ready', { maxRedirects: 0 });
    expect(ready.status()).toBe(200);
    expect(await ready.json()).toMatchObject({ status: 'ready' });
  });

  test('document language follows the URL locale', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto('/cs');
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  });

  test('HTML responses carry a nonce CSP and a request ID', async ({ request }) => {
    const response = await request.get('/cs');
    const csp = response.headers()['content-security-policy'] ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers()['x-request-id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });
});
