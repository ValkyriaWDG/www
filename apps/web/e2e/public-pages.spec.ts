import { expect, type Page, test } from '@playwright/test';
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

test.describe('presskit illustrations', () => {
  const frameOf = (page: Page, id: string) => page.locator(`[data-presskit="${id}"]`);
  const imageFacts = (page: Page, id: string) =>
    frameOf(page, id)
      .locator('img')
      .evaluate(async (img: HTMLImageElement) => {
        img.scrollIntoView();
        await img.decode();
        const frame = img.parentElement!.getBoundingClientRect();
        return {
          alt: img.alt,
          loading: img.loading,
          fit: getComputedStyle(img).objectFit,
          current: new URL(img.currentSrc).pathname,
          naturalRatio: img.naturalWidth / img.naturalHeight,
          frameRatio: frame.width / frame.height,
        };
      });

  for (const width of [1440, 390]) {
    test(`clan key art stays complete and is captioned as game media (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/cs/clan');
      const facts = await imageFacts(page, 'key-art-1080p');
      expect(facts).toMatchObject({ alt: 'Vojáci a vrtulníky s logem hry Wardogs.', loading: 'lazy', fit: 'contain' });
      expect(facts.current).toMatch(/^\/presskit\/key-art-(960|1920)\.webp$/);
      expect(facts.frameRatio).toBeCloseTo(16 / 9, 1);
      expect(facts.naturalRatio).toBeCloseTo(16 / 9, 2);
      await expect(frameOf(page, 'key-art-1080p').locator('figcaption')).toHaveText(/Wardogs.*nezachycuje akci klanu Valkyria/);
      await expectNoHorizontalOverflow(page);
    });
  }

  test('community recruitment illustration keeps its full 16:9 frame in English', async ({ page }) => {
    await page.goto('/en/community');
    const facts = await imageFacts(page, 'flying');
    expect(facts).toMatchObject({ alt: 'A helicopter above a forested valley at sunset in Wardogs.', loading: 'lazy', fit: 'cover' });
    expect(facts.frameRatio).toBeCloseTo(facts.naturalRatio, 1);
    await expect(frameOf(page, 'flying').locator('figcaption')).toHaveText(/does not show a Valkyria event/);
  });

  test('coverless posts use their own game artwork without mixing HLL and Wardogs', async ({ page }) => {
    await page.goto('/cs/news');
    const wardogs = page.locator('[data-placeholder-game="wardogs"]').first();
    await expect(wardogs.locator('img')).toHaveAttribute('src', '/presskit/wardogs-fullmark-white.svg');
    await expect(wardogs.locator('img')).toHaveAttribute('alt', '');
    await expect.poll(() => wardogs.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // The whole wordmark is visible: contained, and smaller than its placeholder (never cover-cropped).
    const mark = await wardogs.locator('img').evaluate((img: HTMLImageElement) => {
      const box = img.getBoundingClientRect();
      const frame = img.parentElement!.getBoundingClientRect();
      return { fit: getComputedStyle(img).objectFit, widthShare: box.width / frame.width, heightShare: box.height / frame.height, ratio: box.width / box.height };
    });
    expect(mark.fit).toBe('contain');
    expect(mark.widthShare).toBeLessThanOrEqual(0.63);
    expect(mark.heightShare).toBeLessThan(1);
    expect(mark.ratio).toBeCloseTo(2467 / 489, 0);
    await expect(wardogs.locator('img[src^="/images/hll/"]')).toHaveCount(0);
    await page.goto('/cs/news?game=hell-let-loose');
    const hllCard = page.locator(`[data-news-card="${FIXTURE_SLUGS.news.listingCs[1]}"]`);
    await expect(hllCard).toHaveAttribute('data-news-scope', 'hell-let-loose');
    const hll = hllCard.locator('[data-placeholder-game="hell-let-loose"]');
    await expect(hll).toBeVisible();
    await expect(hll).toHaveAttribute('aria-hidden', 'true');
    await expect(hll.locator('img')).toHaveCount(2);
    for (const source of ['/images/hll/news.webp', '/brand/valkyria-emblem-733.webp']) {
      const image = hll.locator(`img[src="${source}"]`);
      await expect(image).toHaveAttribute('alt', '');
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(async (img: HTMLImageElement) => { await img.decode(); });
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    }
    await expect(hllCard.locator('img[src^="/presskit/"]')).toHaveCount(0);
  });
});

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
