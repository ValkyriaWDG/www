import { expect, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

const HLL_URL = 'https://valkyriahll.cz/';

test.describe('core public pages', () => {
  test('clan page shows the published story, the HLL website and Discord in both locales', async ({ page }) => {
    await page.goto('/cs/clan');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Klan Valkyria');
    await expect(page.locator('[data-core-page="clan"]')).toHaveAttribute('data-published', 'true');
    const hll = page.locator('[data-hll-website]');
    await expect(hll).toHaveAttribute('href', HLL_URL);
    await expect(hll).toHaveAccessibleName('Web Hell Let Loose (externí odkaz)');
    await expect(hll).not.toHaveAttribute('target', /.+/);
    await expect(page.locator('[data-discord-panel] [data-cta="discord"]')).toHaveAttribute('href', /^https:\/\/(discord\.gg|discord\.com)\//);
    await expect(page.getByRole('navigation', { name: 'Kam dál' }).getByRole('link', { name: 'ČLENOVÉ' })).toHaveAttribute('href', '/cs/members');
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', /\/en\/clan$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/cs\/clan$/);

    await page.goto('/en/clan');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Valkyria clan');
    await expect(page.locator('[data-hll-website]')).toHaveAccessibleName('Hell Let Loose website (external link)');
    await expect(page.locator('[data-hll-website]')).toHaveAttribute('href', HLL_URL);
    await expect(page.locator('link[rel="alternate"][hreflang="cs"]')).toHaveAttribute('href', /\/cs\/clan$/);
  });

  test('community page offers the two choices, explains Discord vs sign-in and links the HLL website', async ({ page }) => {
    await page.goto('/cs/community');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Komunita');
    const discord = page.locator('[data-choice="discord"]');
    await expect(discord).toHaveAttribute('href', /^https:\/\/(discord\.gg|discord\.com)\//);
    await expect(discord).toHaveAccessibleName(/Discord.*\(externí odkaz\)/);
    const join = page.locator('[data-choice="join"]');
    await expect(join).toContainText('Jak se přidat');
    await expect(join).toHaveAttribute('href', '#community-content');
    await join.click();
    await expect(page).toHaveURL(/#community-content$/);
    await expect(page.locator('#community-content')).toBeInViewport();
    const explainer = page.locator('[data-sign-in-explainer]');
    await expect(explainer).toContainText('Připojení na Discord není přihlášení na web');
    await expect(explainer.getByRole('link', { name: 'Přihlásit se na web' })).toHaveAttribute('href', '/cs/login');
    await expect(page.locator('[data-hll-website]')).toHaveAttribute('href', HLL_URL);

    await page.goto('/en/community');
    await expect(page.locator('[data-choice="join"]')).toContainText('How to join');
    await expect(page.locator('[data-sign-in-explainer]')).toContainText('Joining Discord is not signing in');
  });

  test('privacy renders in both locales', async ({ page }) => {
    await page.goto('/cs/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ochrana soukromí');
    await expect(page.locator('[data-core-page="privacy"]')).toContainText('Přihlášení přes Discord');
    await expect(page).toHaveTitle('Ochrana soukromí – Valkyria');
    await page.goto('/en/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
    await expect(page.locator('[data-core-page="privacy"]')).toContainText('Signing in with Discord');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

const PUBLIC_PATHS = (locale: 'cs' | 'en') => [
  `/${locale}/news`,
  `/${locale}/news/${locale === 'cs' ? FIXTURE_SLUGS.news.featureCs : FIXTURE_SLUGS.news.featureEn}`,
  `/${locale}/matches`,
  `/${locale}/matches?view=results`,
  `/${locale}/matches/${FIXTURE_SLUGS.matches.completedVerified}`,
  `/${locale}/members`,
  `/${locale}/members/${FIXTURE_SLUGS.members.longName}`,
  `/${locale}/clan`,
  `/${locale}/community`,
  `/${locale}/privacy`,
];

test.describe('public pages: structure and small screens', () => {
  test('every public page has one h1, a main landmark and a localized title', async ({ page }) => {
    for (const locale of ['cs', 'en'] as const) {
      for (const path of PUBLIC_PATHS(locale)) {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(200);
        await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1);
        await expect(page.locator('main#main-content'), path).toHaveCount(1);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        expect(await page.title(), path).toMatch(/\S/);
      }
    }
  });

  for (const width of [320, 390]) {
    for (const locale of ['cs', 'en'] as const) {
      test(`no page-wide horizontal overflow at ${width} px (${locale})`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
        for (const path of PUBLIC_PATHS(locale)) {
          await page.goto(path);
          await expectNoHorizontalOverflow(page);
        }
      });
    }
  }
});
