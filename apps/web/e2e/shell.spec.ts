import { expect, type Request, test } from '@playwright/test';
import { expectNoHorizontalOverflow, MISSING_VIDEO_PATH, settledBackgroundState, tabUntil } from './support/shell-helpers';

const HLL_URL = 'https://valkyriahll.cz/';

test.describe('menu shell: navigation and language', () => {
  test('document language follows the URL locale', async ({ page }) => {
    await page.goto('/cs');
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('desktop header shows all primary sections including NOVINKY with the current one marked', async ({ page }) => {
    await page.goto('/cs');
    const nav = page.getByRole('navigation', { name: 'Hlavní navigace' });
    for (const [label, href] of [
      ['HLAVNÍ MENU', '/cs'],
      ['NOVINKY', '/cs/news'],
      ['KLAN', '/cs/clan'],
      ['ČLENOVÉ', '/cs/members'],
      ['ZÁPASY', '/cs/matches'],
    ] as const) {
      const link = nav.getByRole('link', { name: label, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', href);
    }
    await expect(nav.getByRole('link', { name: 'HLAVNÍ MENU' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'NOVINKY' })).not.toHaveAttribute('aria-current', /.+/);
    await expect(page.getByRole('tab')).toHaveCount(0);

    await page.goto('/en/news/any-article');
    const enNav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(enNav.getByRole('link', { name: 'NEWS', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(enNav.getByRole('link', { name: 'MAIN MENU' })).not.toHaveAttribute('aria-current', /.+/);
  });

  test('language switcher links to the locale-switch endpoint with the real path and safe filters only', async ({ page }) => {
    await page.goto('/cs/matches?game=wardogs&status=upcoming&page=3&returnTo=https%3A%2F%2Fevil.example');
    const group = page.getByRole('group', { name: 'Jazyk webu' });
    await expect(group).toBeVisible();
    const current = group.locator('[aria-current="true"]');
    await expect(current).toHaveText(/Čeština – aktuální jazyk/);
    const english = group.getByRole('link', { name: 'Přepnout na angličtinu (English)' });
    await expect(english).toBeVisible();
    const href = await english.getAttribute('href');
    expect(href).toMatch(/^\/api\/locale-switch\?to=en&from=%2Fcs%2Fmatches/);
    const from = new URL(href!, 'http://x').searchParams.get('from');
    expect(from).toBe('/cs/matches?game=wardogs&status=upcoming');
    const box = await english.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(42);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);

    await page.goto('/en');
    const czech = page.getByRole('group', { name: 'Website language' }).getByRole('link', { name: 'Switch to Czech (Čeština)' });
    await expect(czech).toHaveAttribute('href', '/api/locale-switch?to=cs&from=%2Fen');
  });

  test('HLL WEB link is visible on desktop with an external indication', async ({ page }) => {
    await page.goto('/cs');
    const hll = page.locator('[data-footer-link="hll"]');
    await expect(hll).toBeVisible();
    await expect(hll).toHaveAttribute('href', HLL_URL);
    await expect(hll).toHaveAccessibleName('HLL WEB (externí odkaz)');
    await expect(hll).not.toHaveAttribute('target', /.+/);
    await expect(page.locator('[data-footer-link="privacy"]')).toHaveAttribute('href', '/cs/privacy');

    await page.goto('/en/clan');
    await expect(page.locator('[data-footer-link="hll"]')).toHaveAccessibleName('HLL WEBSITE (external link)');
  });

  test('unknown routes keep HTTP 404 and render the localized not-found page inside the shell', async ({ page }) => {
    const response = await page.goto('/cs/tato-stranka-neexistuje');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Stránka nenalezena' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Jazyk webu' })).toBeVisible();
    await expect(page.locator('[data-not-found-home]')).toHaveAttribute('href', '/cs');
  });

  test('skip link moves focus to the main content', async ({ page }) => {
    await page.goto('/cs');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Přeskočit na obsah' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('primary Discord CTA and secondary actions are keyboard reachable', async ({ page }) => {
    await page.goto('/cs');
    await tabUntil(page, '[data-cta="discord"]');
    const cta = page.locator('[data-cta="discord"]');
    await expect(cta).toBeFocused();
    await expect(cta).toHaveAttribute('href', /^https:\/\/(discord\.gg|discord\.com)\//);
    await expect(cta).toHaveAccessibleName(/PŘIPOJIT SE NA DISCORD/);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'O KLANU' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'O KLANU' })).toHaveAttribute('href', '/cs/clan');
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-home-action="matches"]')).toBeFocused();
    await expect(page.locator('[data-home-action="matches"]')).toHaveAttribute('href', '/cs/matches');
  });

  test('utility buttons expose names and a tooltip on keyboard focus', async ({ page }) => {
    await page.goto('/cs');
    await tabUntil(page, '[data-utility="news"]');
    const news = page.locator('[data-utility="news"]');
    await expect(news).toHaveAccessibleName('Novinky');
    await expect(news.locator('[aria-hidden="true"]', { hasText: 'Novinky' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(news.locator('[aria-hidden="true"]', { hasText: 'Novinky' })).toBeHidden();
    await expect(page.locator('[data-utility="discord"]')).toHaveAccessibleName('Discord (externí odkaz)');
  });
});

test.describe('menu shell: mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('mobile menu lists NOVINKY, account and HLL links; Escape returns focus to the trigger', async ({ page }) => {
    await page.goto('/cs');
    await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeHidden();
    const switcher = page.getByRole('group', { name: 'Jazyk webu' });
    await expect(switcher).toBeVisible();
    await expect(switcher.getByRole('link', { name: 'Přepnout na angličtinu (English)' })).toBeVisible();

    const trigger = page.locator('[data-mobile-menu-trigger]');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('[data-mobile-menu-panel]');
    const nav = panel.getByRole('navigation', { name: 'Hlavní navigace' });
    await expect(nav.getByRole('link', { name: 'NOVINKY' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'NOVINKY' })).toHaveAttribute('href', '/cs/news');
    await expect(panel.locator('[data-mobile-link="signIn"]')).toHaveAttribute('href', '/cs/login');
    await expect(panel.locator('[data-mobile-link="hll"]')).toHaveAttribute('href', HLL_URL);

    await trigger.focus();
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name: 'HLAVNÍ MENU' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('HLL WEB stays visible in the mobile footer', async ({ page }) => {
    await page.goto('/cs');
    const hll = page.locator('[data-footer-link="hll"]');
    await hll.scrollIntoViewIfNeeded();
    await expect(hll).toBeVisible();
    await expect(hll).toHaveAttribute('href', HLL_URL);
  });

  test('coarse narrow devices start poster-only with an explicit play control', async ({ page }) => {
    const videoRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(MISSING_VIDEO_PATH)) videoRequests.push(request.url());
    });
    await page.goto('/cs');
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-reason', 'narrow-coarse');
    await expect(page.getByRole('button', { name: 'Přehrát pozadí' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(videoRequests).toEqual([]);
  });
});

test.describe('menu shell: no horizontal overflow', () => {
  for (const width of [320, 390]) {
    for (const locale of ['cs', 'en']) {
      test(`${locale} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
        await page.goto(`/${locale}`);
        await expectNoHorizontalOverflow(page);
        await page.locator('[data-mobile-menu-trigger]').click();
        await expectNoHorizontalOverflow(page);
        await page.goto(`/${locale}/not-a-real-page`);
        await expectNoHorizontalOverflow(page);
      });
    }
  }
});

test.describe('background media', () => {
  test('reduced motion makes no request for the configured video', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const videoRequests: Request[] = [];
    page.on('request', (request) => {
      if (request.url().includes(MISSING_VIDEO_PATH)) videoRequests.push(request);
    });
    await page.goto('/cs');
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-reason', 'reduced-motion');
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-state', 'paused');
    await expect(page.locator('[data-background-video] source')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Přehrát pozadí' })).toBeEnabled();
    await expect(page.locator('[data-scene-fallback]')).toBeVisible();
    await page.getByRole('link', { name: 'NOVINKY' }).first().click();
    await expect(page).toHaveURL(/\/cs\/news$/);
    await page.waitForLoadState('networkidle');
    expect(videoRequests).toHaveLength(0);
    await context.close();
  });

  test('a missing video keeps the fallback scene without error UI', async ({ page }) => {
    const videoRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(MISSING_VIDEO_PATH)) videoRequests.push(request.url());
    });
    await page.goto('/cs');
    const canPlayMp4 = await page.evaluate(() => document.createElement('video').canPlayType('video/mp4') !== '');
    expect(await settledBackgroundState(page)).toBe('unavailable');
    if (canPlayMp4) expect(videoRequests.length).toBeGreaterThan(0);
    await expect(page.locator('[data-scene-fallback]')).toBeVisible();
    await expect(page.locator('[data-background-video]')).toHaveCSS('opacity', '0');
    // Scoped to the shell: Next's own (empty) route announcer also carries role="alert".
    await expect(page.locator('[data-route-mode]').getByRole('alert')).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    const toggle = page.locator('[data-background-toggle]');
    await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAccessibleName('Video na pozadí není dostupné');
    // The page stays fully usable.
    await expect(page.locator('[data-cta="discord"]')).toBeVisible();
  });

  test('the persistent video element survives client navigation without a second download', async ({ page }) => {
    let requests = 0;
    await page.route(`**${MISSING_VIDEO_PATH}`, () => {
      requests += 1; // never answered: the element stays in its loading state
    });
    await page.goto('/cs');
    await expect(page.locator('[data-background-video] source')).toHaveCount(1);
    await expect.poll(() => requests).toBe(1);
    const before = await page.locator('[data-background-video]').elementHandle();
    await page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('link', { name: 'KLAN' }).click();
    await expect(page).toHaveURL(/\/cs\/clan$/);
    await page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('link', { name: 'HLAVNÍ MENU' }).click();
    await expect(page).toHaveURL(/\/cs$/);
    expect(await page.evaluate((element) => element === document.querySelector('[data-background-video]'), before)).toBe(true);
    expect(requests).toBe(1);
  });

  test('a hidden tab pauses the video and a visible tab resumes it when allowed', async ({ page }) => {
    await page.route(`**${MISSING_VIDEO_PATH}`, () => undefined);
    await page.goto('/cs');
    const video = page.locator('[data-background-video]');
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
    const setHidden = (hidden: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
    await setHidden(false);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
    // An explicit pause is respected when the tab becomes visible again.
    await page.getByRole('button', { name: 'Pozastavit pozadí' }).click();
    await setHidden(true);
    await setHidden(false);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  });

  test('rejected autoplay keeps the scene and offers an explicit Play control', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'));
    });
    await page.route(`**${MISSING_VIDEO_PATH}`, () => undefined);
    await page.goto('/en');
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-state', 'blocked');
    await expect(page.getByRole('button', { name: 'Play background' })).toBeEnabled();
    await expect(page.locator('[data-background-video]')).toHaveCSS('opacity', '0');
    await expect(page.locator('[data-route-mode]').getByRole('alert')).toHaveCount(0);
  });

  test('pause preference persists across navigation and reloads', async ({ page }) => {
    // Hold the video response so the element stays in its loading state (no error yet).
    await page.route(`**${MISSING_VIDEO_PATH}`, () => undefined);
    await page.goto('/cs');
    const pause = page.getByRole('button', { name: 'Pozastavit pozadí' });
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(page.getByRole('button', { name: 'Přehrát pozadí' })).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem('valkyria.background'))).toBe('paused');

    await page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('link', { name: 'NOVINKY' }).click();
    await expect(page).toHaveURL(/\/cs\/news$/);
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-reason', 'user-paused');
    await expect(page.getByRole('button', { name: 'Přehrát pozadí' })).toBeVisible();

    await page.unroute(`**${MISSING_VIDEO_PATH}`);
    const afterReload: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(MISSING_VIDEO_PATH)) afterReload.push(request.url());
    });
    await page.goto('/en');
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-reason', 'user-paused');
    await expect(page.getByRole('button', { name: 'Play background' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(afterReload).toEqual([]);
  });
});
