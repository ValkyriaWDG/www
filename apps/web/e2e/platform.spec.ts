import { expect, type Page, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

/** The visible game switch (a second copy lives in the closed mobile menu drawer). */
const gameSwitch = (page: Page) => page.locator('[data-game-switch]').first();

/**
 * Unified Valkyria platform: community hub, game sections with their own presentation,
 * game switch that keeps locale and page category, and the preserved Wardogs section.
 * Synthetic fixtures only.
 */

test.describe('platform routing', () => {
  test('`/` opens the Czech community hub with both games and shared sections', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/cs$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Komunita Valkyria' })).toBeVisible();
    await expect(page.locator('[data-hub-game="hll"]')).toHaveAttribute('href', '/cs/hll');
    await expect(page.locator('[data-hub-game="wardogs"]')).toHaveAttribute('href', '/cs/wardogs');
    for (const key of ['news', 'clan', 'members', 'matches', 'community']) {
      await expect(page.locator(`[data-hub-shared="${key}"]`)).toHaveAttribute('href', `/cs/${key}`);
    }
    // No game is current on shared community routes.
    await expect(gameSwitch(page).locator('[aria-current]')).toHaveCount(0);
  });

  test('each game has its own presentation and only its own sections', async ({ page }) => {
    await page.goto('/cs/hll');
    await expect(page.locator('[data-game-shell="hll"]')).toHaveAttribute('data-theme', 'hll');
    const menu = page.getByRole('navigation', { name: 'Menu Hell Let Loose' });
    for (const [section, href] of [
      ['news', '/cs/hll/news'],
      ['matches', '/cs/hll/matches'],
      ['servers', '/cs/hll/servers'],
      ['members', '/cs/hll/members'],
      ['field-manual', '/cs/hll/field-manual'],
      ['faq', '/cs/hll/faq'],
      ['clan', '/cs/hll/clan'],
      ['community', '/cs/hll/community'],
    ] as const) {
      await expect(menu.locator(`[data-hll-menu-item="${section}"]`)).toHaveAttribute('href', href);
    }
    await expect(gameSwitch(page).locator('[aria-current="true"]')).toHaveAttribute('data-game-option', 'hll');

    await page.goto('/cs/wardogs');
    await expect(page.locator('[data-game-shell="hll"]')).toHaveCount(0);
    await expect(gameSwitch(page).locator('[aria-current="true"]')).toHaveAttribute('data-game-option', 'wardogs');
    const nav = page.getByRole('navigation', { name: 'Hlavní navigace' });
    await expect(nav.getByRole('link', { name: 'HLAVNÍ MENU' })).toHaveAttribute('href', '/cs/wardogs');
    await expect(nav.getByRole('link', { name: 'NOVINKY', exact: true })).toHaveAttribute('href', '/cs/wardogs/news');

    for (const path of ['/cs/wardogs/servers', '/cs/wardogs/field-manual', '/cs/wardogs/faq', '/cs/unknown-game/news', '/de/hll']) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
  });

  test('the top strip is identical in both games: height, logo, game switch, language and account', async ({ page }) => {
    // Measure only hydrated controls: until the query-aware switches replace their
    // server fallbacks (aria-busy), a resolved element can be detached before it is measured.
    const hydrated = () => expect(page.locator('[data-game-switch][aria-busy="true"], [role="group"][aria-busy="true"]')).toHaveCount(0);
    const strip = async () => {
      await hydrated();
      return page.evaluate(() => {
        const header = document.querySelector('[data-shell-header], [data-hll-masthead]')!;
        const round = (rect: DOMRect): [number, number, number, number] => [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)];
        const box = (selector: string) => {
          const element = Array.from(header.querySelectorAll(selector)).find((candidate) => candidate.getBoundingClientRect().width > 0);
          return element ? round(element.getBoundingClientRect()) : null;
        };
        return {
          strip: round(header.getBoundingClientRect()),
          crest: box('[data-brand] img, [data-hll-identity] img'),
          game: box('[data-game-switch]'),
          language: box('[role="group"]:has([data-locale])'),
          account: box('[data-account]'),
          community: box('[data-platform-home], [data-hll-community-link]'),
          menu: box('button[aria-expanded]'),
        };
      });
    };
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [1024, 768],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/cs/wardogs');
      const reference = await strip();
      if (width >= 1152) {
        // Logo top left; game switch, language and account in that order on one row at the right.
        const [crestX] = reference.crest!;
        const [gameX, gameY, gameWidth, gameHeight] = reference.game!;
        const [languageX, languageY, languageWidth, languageHeight] = reference.language!;
        const [accountX, , accountWidth] = reference.account!;
        expect(crestX, `@${width}`).toBeLessThan(width * 0.1);
        expect(gameX + gameWidth).toBeLessThanOrEqual(languageX);
        expect(languageX - (gameX + gameWidth)).toBeLessThan(24);
        expect(languageX + languageWidth).toBeLessThanOrEqual(accountX);
        expect(Math.abs(gameY + gameHeight / 2 - (languageY + languageHeight / 2))).toBeLessThan(4);
        expect(accountX + accountWidth).toBeGreaterThan(width * 0.9);
      }
      // Switching games or opening a section never moves or resizes anything in the strip.
      for (const path of ['/cs/hll', '/cs/wardogs/news', '/cs/hll/news', '/cs']) {
        await page.goto(path);
        await expect(page.locator('[data-platform-bar]')).toHaveCount(0);
        expect(await strip(), `${path} @${width}`).toEqual(reference);
      }
    }
    // Phones: the full-width game switch row sits directly under the strip in both games.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/cs/wardogs/news', '/cs/hll/news']) {
      await page.goto(path);
      await hydrated();
      const row = page.locator('[data-game-switch][data-variant="stack"]').first();
      await expect(row).toBeVisible();
      const box = (await row.boundingBox())!;
      expect(box.width, path).toBeGreaterThan(340);
      expect(box.y, path).toBeLessThan(200);
      await expectNoHorizontalOverflow(page);
    }
  });

  test('the ghosted clan crest is identical on both main menus and absent from content pages', async ({ page }) => {
    const crest = async (path: string) => {
      await page.goto(path);
      const image = page.locator('[data-emblem], [data-hll-crest]').first();
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
      const box = (await image.boundingBox())!;
      const style = await image.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { opacity: Number(computed.opacity), filter: computed.filter };
      });
      return { ...box, ...style };
    };
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      const wardogs = await crest('/cs/wardogs');
      const hll = await crest('/cs/hll');
      const at = `@${width}x${height}`;
      // Same size, centre, opacity and colour (no HLL-only grayscale).
      expect(Math.abs(hll.width - wardogs.width), at).toBeLessThan(2);
      expect(Math.abs(hll.x + hll.width / 2 - (wardogs.x + wardogs.width / 2)), at).toBeLessThan(2);
      expect(Math.abs(hll.y + hll.height / 2 - (wardogs.y + wardogs.height / 2)), at).toBeLessThan(2);
      expect(hll.opacity, at).toBe(wardogs.opacity);
      expect(hll.filter, at).toBe('none');
      expect(wardogs.filter, at).toBe('none');
    }
    // Content pages keep the scene but not the crest, like Wardogs subpages.
    for (const path of ['/cs/hll/news', '/cs/wardogs/news']) {
      await page.goto(path);
      await expect(page.locator('[data-emblem], [data-hll-crest]').first(), path).toBeHidden();
    }
  });

  test('the community hub shows the owner cover; phones get the small copy and shared pages never load it', async ({ browser }) => {
    const covers: string[] = [];
    const open = async (width: number, height: number) => {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      page.on('request', (request) => {
        if (request.url().includes('/images/community/hub-cover')) covers.push(new URL(request.url()).pathname);
      });
      return { context, page };
    };
    const desktop = await open(1920, 1080);
    await desktop.page.goto('/cs/news');
    await expect(desktop.page.locator('[data-scene-fallback]')).toBeAttached();
    await expect(desktop.page.locator('[data-hub-cover]')).toHaveCount(0);
    expect(covers).toEqual([]);

    await desktop.page.goto('/cs');
    const cover = desktop.page.locator('[data-hub-cover] img');
    await expect.poll(() => cover.evaluate((image: HTMLImageElement) => (image.complete ? image.currentSrc : ''))).toContain('/images/community/hub-cover-1672.webp');
    const box = (await cover.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(1920);
    expect(box.height).toBeGreaterThanOrEqual(1080);
    // The hub carries the crest in its heading; the scene's ghosted crest stays on the game landings.
    await expect(desktop.page.locator('[data-emblem]')).toBeHidden();
    await desktop.context.close();

    const phone = await open(390, 844);
    await phone.page.goto('/en');
    await expect
      .poll(() => phone.page.locator('[data-hub-cover] img').evaluate((image: HTMLImageElement) => (image.complete ? image.currentSrc : '')))
      .toContain('/images/community/hub-cover-960.webp');
    await expectNoHorizontalOverflow(phone.page);
    await phone.context.close();
  });

  test('the FAQ is an HLL menu destination that stays honestly unpublished until editors publish it', async ({ page }) => {
    await page.goto('/cs/hll/faq');
    await expect(page.getByRole('heading', { level: 1, name: 'Časté dotazy' })).toBeVisible();
    await expect(page.locator('[data-core-page="faq"]')).toHaveAttribute('data-published', 'false');
    await expect(page.getByText('Tato stránka zatím není zveřejněná.')).toBeVisible();
    // The seeded draft outline never leaks before publication.
    await expect(page.getByText('Jak se přidat do Valkyrie?')).toHaveCount(0);
    await expect(page.locator('[data-faq-index]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/cs\/faq$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect((await page.goto('/en/faq'))?.status()).toBe(200);
    await expect(page.locator('[data-core-page="faq"]')).toHaveAttribute('data-published', 'false');
  });

  test('game switch keeps the locale and the page category, or explains the destination', async ({ page }) => {
    await page.goto('/cs/hll/news');
    await gameSwitch(page).locator('[data-game-option="wardogs"]').click();
    await expect(page).toHaveURL(/\/cs\/wardogs\/news$/);
    await expect(page.locator('[data-game-switch-notice]')).toHaveCount(0);

    await page.goto('/en/hll/servers');
    await gameSwitch(page).locator('[data-game-option="wardogs"]').click();
    await expect(page).toHaveURL(/\/en\/wardogs\?switch=section$/);
    await expect(page.locator('[data-game-switch-notice="section"]')).toContainText('Switched to Wardogs');

    await page.goto('/cs/wardogs/matches?view=results');
    await gameSwitch(page).locator('[data-game-option="hll"]').click();
    await expect(page).toHaveURL(/\/cs\/hll\/matches\?view=results$/);
    await expect(gameSwitch(page).locator('[aria-current="true"]')).toHaveAttribute('data-game-option', 'hll');
  });

  test('language switch keeps the game section', async ({ page }) => {
    await page.goto('/cs/hll/members');
    await page.getByRole('link', { name: 'Přepnout na angličtinu (English)' }).first().click();
    await expect(page).toHaveURL(/\/en\/hll\/members$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(gameSwitch(page).locator('[aria-current="true"]')).toHaveAttribute('data-game-option', 'hll');
  });

  test('HLL landing is keyboard-operable and reflows at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/cs/hll');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const first = page.locator('[data-hll-menu="landing"] [data-hll-menu-item="news"]');
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/cs\/hll\/news$/);

    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of ['/cs/hll', '/cs/hll/field-manual', '/cs/hll/servers', '/cs']) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
  });
});

test.describe('HLL servers (labelled synthetic snapshots)', () => {
  test('list without selection, row selection in the URL and history', async ({ page }) => {
    await page.goto('/cs/hll/servers');
    await expect(page.locator('[data-synthetic-data]')).toBeVisible();
    await expect(page.locator('[data-server-detail="none"]')).toBeVisible();
    const rows = page.locator('[data-server-table] tbody tr');
    await expect(rows).toHaveCount(3);
    await rows.nth(1).getByRole('link').click();
    await expect(page).toHaveURL(/\/cs\/hll\/servers\?server=/);
    await expect(page.locator('#server-detail-title')).toContainText('[SYNTHETIC]');
    await expect(rows.nth(1)).toHaveAttribute('data-selected', 'true');
    await page.goBack();
    await expect(page).toHaveURL(/\/cs\/hll\/servers$/);
    await expect(page.locator('[data-server-detail="none"]')).toBeVisible();

    await page.goto('/cs/hll/servers?server=removed-server');
    await expect(page.locator('[data-server-detail="missing"]')).toBeVisible();
  });

  test('round details and live statistics link only for a fresh observation', async ({ page }) => {
    await page.goto('/cs/hll/servers?server=synthetic-alpha');
    const detail = page.locator('section[aria-labelledby="server-detail-title"]');
    await expect(detail.getByText('Synthetic Map East')).toBeVisible();
    await expect(detail.getByText('54 min')).toBeVisible();
    await expect(page.locator('[data-server-score]')).toHaveText('Spojenci 3 : 2 Osa');
    await expect(detail.getByText('Spojenci 33 · Osa 31')).toBeVisible();
    await expect(page.locator('[data-server-stats]')).toHaveAttribute('href', 'https://stats.synthetic-alpha.invalid/');

    // A stale observation keeps the map but not round progress.
    await page.goto('/en/hll/servers?server=synthetic-bravo');
    await expect(page.locator('#server-detail-title')).toContainText('Bravo');
    await expect(page.locator('[data-server-score]')).toHaveCount(0);
    await expect(page.locator('[data-server-stats]')).toHaveCount(0);
  });
});

test.describe('HLL field manual (synthetic articles)', () => {
  test('browse categories, filter, search without diacritics and open an article', async ({ page }) => {
    await page.goto('/cs/hll/field-manual');
    await expect(page.getByRole('heading', { level: 1, name: 'Příručka' })).toBeVisible();
    const cards = page.locator('[data-manual-grid="categories"] [data-manual-category]');
    await expect(cards).toHaveCount(4);
    // Categories with only drafts are hidden.
    await expect(page.locator('[data-manual-category="spawns"]')).toHaveCount(0);

    await page.locator('[data-category-link="roles"]').click();
    await expect(page).toHaveURL(/category=roles$/);
    await expect(page.locator('[data-manual-article]')).toHaveCount(1);

    await page.goto('/cs/hll/field-manual');
    const search = page.getByRole('searchbox', { name: 'Hledat v příručce' });
    await search.fill('druzstva');
    await expect(page).toHaveURL(/q=druzstva$/);
    await expect(page.locator('[data-manual-summary]')).toContainText('1 výsledek');
    await expect(search).toBeFocused();
    await page.locator('[data-manual-article="ukazka-velitel-druzstva"] a').click();
    await expect(page).toHaveURL(/\/cs\/hll\/field-manual\/ukazka-velitel-druzstva$/);
    await expect(page.locator('[data-manual-toc] a').first()).toHaveAttribute('href', '#priprava');
  });

  test('shows a calm no-results state and never exposes drafts', async ({ page }) => {
    await page.goto('/cs/hll/field-manual?q=soukromy%20koncept');
    await expect(page.locator('[data-manual-no-results]')).toBeVisible();
    await page.locator('[data-manual-no-results] [data-clear-search]').click();
    await expect(page).toHaveURL(/\/cs\/hll\/field-manual$/);
    expect((await page.goto('/cs/hll/field-manual/ukazka-koncept-spawny'))?.status()).toBe(404);
    expect((await page.goto('/en/hll/field-manual/sample-tank-crew-draft'))?.status()).toBe(404);
  });

  test('article provenance and language switch by entity or with a missing-translation notice', async ({ page }) => {
    await page.goto('/cs/hll/field-manual/ukazka-prvni-nastaveni');
    await expect(page.locator('[data-manual-provenance]')).toContainText('Syntetický autor A');
    await page.getByRole('link', { name: 'Přepnout na angličtinu (English)' }).first().click();
    await expect(page).toHaveURL(/\/en\/hll\/field-manual\/sample-first-setup$/);

    await page.goto('/cs/hll/field-manual/ukazka-posadka-tanku');
    await page.getByRole('link', { name: 'Přepnout na angličtinu (English)' }).first().click();
    await expect(page).toHaveURL(/\/en\/hll\/field-manual\?missing=cs(%3A|:)ukazka-posadka-tanku$/);
    const notice = page.locator('[data-missing-translation]');
    await expect(notice).toBeVisible();
    await expect(notice.locator('[data-missing-source]')).toHaveAttribute('href', '/cs/hll/field-manual/ukazka-posadka-tanku');
  });
});
