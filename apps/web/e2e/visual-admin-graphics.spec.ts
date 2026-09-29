import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { createPost, expectSaved, fillPublishable, publish } from './admin-editorial-helpers';
import { signInAs } from './support/auth';

/**
 * Captioned screenshots of the editorial template library (graphics pack 2026-09-29) for
 * PR/issue evidence. Opt-in:
 *   CAPTURE_EVIDENCE=1 pnpm exec playwright test e2e/visual-admin-graphics.spec.ts --project=chromium-admin-capture --no-deps
 * Output: <repo>/.local/evidence/admin-graphics/ (gitignored) + captures.json. The post is
 * synthetic ("[Ukázka]") and created through the UI in this run.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture template library screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/admin-graphics');
const captures: { file: string; caption: string; viewport: string; uiLocale: string; route: string }[] = [];
const state: { assetId?: string; slug?: string } = {};

async function signedIn(browser: Browser, width: number, height: number, locale: 'cs' | 'en') {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: locale === 'cs' ? 'cs-CZ' : 'en-GB',
    timezoneId: 'Europe/Prague',
    isMobile: width < 768,
    hasTouch: width < 768,
    reducedMotion: 'reduce',
  });
  await signInAs(context, { roles: ['editor'], name: 'Synthetická redaktorka' });
  return { context, page: await context.newPage() };
}

async function shot(page: Page, file: string, caption: string, uiLocale: 'cs' | 'en', fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('main img'))
      .filter((image) => image.loading !== 'lazy' || image.getBoundingClientRect().top < window.innerHeight)
      .every((image) => image.complete),
  );
  await page.screenshot({ path: path.join(outDir, file), animations: 'disabled', caret: 'hide', fullPage });
  const viewport = page.viewportSize();
  captures.push({ file, caption, viewport: `${viewport?.width}x${viewport?.height}${fullPage ? ' (full page)' : ''}`, uiLocale, route: new URL(page.url()).pathname + new URL(page.url()).search });
}

const openTemplates = async (page: Page) => {
  const panel = page.getByTestId('editorial-templates');
  await panel.locator('summary').click();
  await panel.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 80));
  await expect(panel.locator('[data-editorial-template]')).toHaveCount(8);
  for (const image of await panel.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await panel.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 80));
};

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

test('template library (cs, desktop)', async ({ browser }) => {
  const { context, page } = await signedIn(browser, 1440, 1000, 'cs');
  await page.goto('/cs/admin/media');
  await openTemplates(page);
  await shot(page, 'templates-cs-1440x1000.png', 'Media library /cs/admin/media for an editor: "Šablony pozadí Valkyria (8)" opened — the eight text-free pack scenes with game label, default Czech alt text and "Přidat do knihovny" (or "Už je v knihovně – otevřít" when the same bytes are already an asset), plus the AI-illustration rights note.', 'cs');
  const card = page.locator('[data-editorial-template="hll-assault"]');
  if (await card.locator('[data-template-add]').count()) await card.locator('[data-template-add]').click();
  else await card.locator('[data-template-asset]').click();
  await expect(page).toHaveURL(/asset=[0-9a-f-]{36}$/);
  state.assetId = new URL(page.url()).searchParams.get('asset')!;
  await expect(page.getByTestId('media-detail-filename')).toHaveText('valkyria-hll-assault.webp');
  await page.getByTestId('media-detail').evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 80));
  await shot(page, 'template-asset-detail-cs-1440x1000.png', 'After "Přidat do knihovny": an ordinary private editorial asset (valkyria-hll-assault.webp, 1920×1080) opens in the normal detail panel with editable CS/EN default alt text, provenance naming the pack file and SHA-256, and rights; unused, so not publicly served.', 'cs');
  await context.close();
});

test('template as a cover of a published article (cs)', async ({ browser }) => {
  const { context, page } = await signedIn(browser, 1440, 1000, 'cs');
  const suffix = Date.now().toString(36);
  await createPost(page, `[Ukázka] Článek se šablonou pozadí ${suffix}`);
  await page.getByTestId('cover-choose').click();
  const picker = page.getByTestId('media-picker');
  await picker.getByRole('searchbox').fill('valkyria-hll-assault');
  await picker.getByRole('searchbox').press('Enter');
  await picker.locator(`[data-asset-id="${state.assetId}"]`).click();
  await shot(page, 'template-picker-cs-1440x1000.png', 'Cover picker in the news editor: the imported template is picked like any library image; its default Czech alt text pre-fills the per-language alt field.', 'cs');
  await picker.getByTestId('media-picker-confirm').click();
  await page.getByTestId('editor-actions').scrollIntoViewIfNeeded();
  await shot(page, 'template-editor-actions-cs-1440x1000.png', 'News editor with the template as its cover: the action bar shows the pack glyphs on "Uložit" (save) and "Náhled" (preview) next to the unchanged publish action; labels and states unchanged.', 'cs');
  await fillPublishable(page, 'Syntetický článek, jehož titulní obrázek je šablona pozadí z grafického balíku.', 'Syntetický perex článku se šablonou pozadí.');
  await expectSaved(page);
  await publish(page);
  const href = await page.getByTestId('live-link').getAttribute('href');
  await page.goto(href!);
  await page.waitForLoadState('networkidle');
  await shot(page, 'template-article-cs-1440x1000.png', 'The published synthetic article with the template as its cover: headline and text are HTML in the CMS; the image carries no baked copy.', 'cs');
  await context.close();
});

test('template library (en, phone)', async ({ browser }) => {
  const { context, page } = await signedIn(browser, 390, 844, 'en');
  await page.goto('/en/admin/media');
  await openTemplates(page);
  await shot(page, 'templates-en-390x844.png', 'Template library in English on a 390×844 phone: cards stack, English game labels, default alt text and actions; no horizontal overflow.', 'en');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await context.close();
});
