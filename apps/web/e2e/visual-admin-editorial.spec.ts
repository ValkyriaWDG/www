import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';
import { canvas, expectSaved, syntheticPng } from './admin-editorial-helpers';
import { signInAs } from './support/auth';

/**
 * Captioned screenshots of the editorial administration for PR/issue evidence. Opt-in:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-admin-editorial.spec.ts
 * Output: <repo>/.local/evidence/admin-editorial/ (gitignored) + captions.json. Content is
 * synthetic ("[Ukázka]" / "[Sample]") and created through the UI in this run.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture editorial admin screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/admin-editorial');
const captures: { file: string; caption: string; viewport: string; uiLocale: string; contentLocale?: string }[] = [];
const state: { documentId?: string; coverName?: string } = {};

async function newContext(browser: Browser, width: number, height: number, locale: 'cs' | 'en' = 'cs'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: locale === 'cs' ? 'cs-CZ' : 'en-GB',
    timezoneId: 'Europe/Prague',
    isMobile: width < 768,
    hasTouch: width < 768,
  });
  await signInAs(context, { roles: ['editor'], name: 'Synthetická redaktorka' });
  return { context, page: await context.newPage() };
}

async function shot(page: Page, file: string, caption: string, meta: { uiLocale: 'cs' | 'en'; contentLocale?: 'cs' | 'en'; fullPage?: boolean; target?: Locator }) {
  await page.evaluate(() => document.fonts.ready);
  // Visible content images only (the shell's hidden/lazy background media never loads in admin).
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('main img'))
      .filter((image) => image.loading !== 'lazy' || image.getBoundingClientRect().top < window.innerHeight)
      .every((image) => image.complete),
  );
  if (meta.target) await meta.target.screenshot({ path: path.join(outDir, file), animations: 'disabled', caret: 'hide' });
  else await page.screenshot({ path: path.join(outDir, file), animations: 'disabled', caret: 'hide', fullPage: meta.fullPage ?? false });
  const viewport = page.viewportSize();
  const scope = meta.target ? ' (element)' : meta.fullPage ? ' (full page)' : '';
  captures.push({ file, caption, viewport: `${viewport?.width}x${viewport?.height}${scope}`, uiLocale: meta.uiLocale, contentLocale: meta.contentLocale });
}

async function pickUpload(page: Page, name: string, color: string, alt: string, caption = '') {
  const picker = page.getByTestId('media-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId('media-upload-input').setInputFiles({ name, mimeType: 'image/png', buffer: await syntheticPng(1600, 900, color) });
  await expect(picker.getByTestId('upload-item').first()).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
  await picker.locator('#media-picker-alt').fill(alt);
  if (caption) await picker.locator('#media-picker-caption').fill(caption);
  await picker.getByTestId('media-picker-confirm').click();
  await expect(picker).toBeHidden();
}

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captions.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), browser: 'Chromium (Playwright)', captures }, null, 2)}\n`);
});

test('editor workspace: Czech UI editing English content, save states, conflict, revisions, schedule, preview', async ({ browser }) => {
  const { context, page } = await newContext(browser, 1920, 1080);
  await page.goto('/cs/admin/news/new');
  await page.getByTestId('new-post-title').fill('[Ukázka] Turnajový víkend Wardogs');
  await page.getByTestId('new-post-submit').click();
  await expect(page.getByTestId('news-editor')).toBeVisible();
  state.documentId = /news\/([0-9a-f-]{36})/.exec(page.url())![1];

  const body = canvas(page);
  await body.click();
  await page.getByLabel('Typ odstavce').selectOption('heading2');
  await page.keyboard.type('Jak probíhal víkend');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Syntetický tým odehrál ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('tři napínavé zápasy');
  await page.keyboard.press('Control+b');
  await page.keyboard.type(' a postoupil do finále. Text je pouze ukázkový.');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Odrážkový seznam' }).click();
  await page.keyboard.type('Sobota: skupinová fáze');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Neděle: play-off');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Vložit obrázek' }).click();
  await pickUpload(page, 'ukazka-mapa.png', '#24435e', 'Syntetická mapa bojiště', 'Ukázkový obrázek v textu');
  await body.press('Control+End');
  await page.getByRole('button', { name: 'Vložit tabulku' }).click();
  await page.keyboard.type('Zápas');
  await page.getByTestId('cover-choose').click();
  state.coverName = 'ukazka-titulni.png';
  await pickUpload(page, state.coverName, '#5e3324', 'Syntetický titulní obrázek turnaje', 'Ukázkový titulní obrázek');
  await page.getByTestId('editor-excerpt').fill('Ukázkový perex: syntetický tým odehrál víkendový turnaj ve hře Wardogs.');
  await page.getByTestId('editor-author').fill('Redakce Valkyria');
  await page.getByTestId('editor-category').selectOption('match-report');
  await page.getByTestId('editor-save').click();
  await expectSaved(page);
  await page.getByTestId('editor-publish').click();
  await expect(page.getByTestId('editor-published')).toBeVisible();

  // English translation edited from the Czech interface.
  await page.getByTestId('add-translation-en').click();
  await expect(page.getByTestId('content-locale')).toContainText('Angličtina (EN)');
  await page.getByTestId('editor-title').fill('[Sample] Wardogs tournament weekend');
  const english = canvas(page, 'en');
  await english.click();
  await page.getByLabel('Typ odstavce').selectOption('heading2');
  await page.keyboard.type('How the weekend went');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The synthetic team played ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('three close matches');
  await page.keyboard.press('Control+b');
  await page.keyboard.type(' and reached the final. Sample text only.');
  await page.getByTestId('cover-choose').click();
  const picker = page.getByTestId('media-picker');
  await picker.locator(`[data-asset-id]`).filter({ hasText: state.coverName }).first().click();
  await picker.locator('#media-picker-alt').fill('Synthetic tournament cover image');
  await picker.getByTestId('media-picker-confirm').click();
  await page.getByTestId('editor-excerpt').fill('Sample excerpt: a synthetic team played a weekend Wardogs tournament.');
  await page.getByTestId('editor-save').click();
  await expectSaved(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '02-editor-cs-ui-en-content-1920x1080.png', 'Post editor at 1920×1080: Czech interface editing the ENGLISH translation (both locales shown explicitly), content-language tabs with per-translation state (Czech published, English draft), formatting toolbar, wide canvas, cover picker and document/publication side panel; "Koncept uložen" save state.', { uiLocale: 'cs', contentLocale: 'en' });
  await shot(page, '02b-editor-cs-ui-en-content-full.png', 'Same editor as a full-page capture: side panel sections (publication, schedule, document, cover, category/tags/game, SEO, revisions, archive).', { uiLocale: 'cs', contentLocale: 'en', fullPage: true });

  // Autosave: edit, wait for the debounced server save.
  await page.getByTestId('editor-excerpt').fill('Sample excerpt: a synthetic team played a weekend Wardogs tournament (edited).');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'dirty');
  await page.getByTestId('editor-actions').scrollIntoViewIfNeeded();
  await shot(page, '03a-autosave-dirty.png', 'Unsaved-changes state ("Neuložené změny") shown in the sticky action bar before the debounced autosave runs.', { uiLocale: 'cs', contentLocale: 'en' });
  await expectSaved(page, 20_000);
  await shot(page, '03b-autosave-saved.png', 'Debounced autosave completed ("Koncept uložen" with time) — the English draft only; nothing was published.', { uiLocale: 'cs', contentLocale: 'en' });

  // Save failure: the network drops the server action; text stays in memory with retry.
  await page.route('**/admin/news/**', (route) => (route.request().headers()['next-action'] ? route.abort('failed') : route.continue()));
  await page.getByTestId('editor-title').fill('[Sample] Wardogs tournament weekend – offline edit');
  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('save-failed-notice')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '03c-save-failed.png', 'Save failed (network unavailable): explicit "Uložení se nezdařilo" notice with retry; the unsent title stays in the editor.', { uiLocale: 'cs', contentLocale: 'en' });
  await page.unroute('**/admin/news/**');
  await page.getByTestId('save-retry').click();
  await expectSaved(page);

  // Conflict: another editor saves the English translation meanwhile.
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await signInAs(other, { roles: ['editor'], name: 'Synthetic translator' });
  const otherPage = await other.newPage();
  await otherPage.goto(`/cs/admin/news/${state.documentId}?lang=en`);
  await otherPage.getByTestId('editor-title').fill('[Sample] Wardogs tournament weekend – translator edit');
  await otherPage.getByTestId('editor-save').click();
  await expectSaved(otherPage);
  await other.close();
  await page.getByTestId('editor-title').fill('[Sample] Wardogs tournament weekend – my edit');
  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('conflict-notice')).toBeVisible();
  await expect(page.getByTestId('conflict-server')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '03d-conflict.png', 'Revision conflict on the same translation: explicit notice naming who saved the newer version, local text kept, autosave paused; options to load the latest (discard mine), preview the newer version or overwrite after confirmation.', { uiLocale: 'cs', contentLocale: 'en' });
  await page.getByTestId('conflict-reload').click();
  await expectSaved(page);

  // Revision history.
  await page.getByTestId('revisions-section').locator('summary').click();
  await expect(page.getByTestId('revision-item').first()).toBeVisible();
  await page.getByTestId('revisions-section').scrollIntoViewIfNeeded();
  await shot(page, '04-revision-history.png', 'Revision history panel of the English translation (1920×1080 layout, element capture): kind (autosave/saved/restored), author and time, current-draft marker, per-revision preview and "Obnovit do konceptu" (restore to draft).', { uiLocale: 'cs', contentLocale: 'en', target: page.getByTestId('revisions-section') });

  // Schedule panel on the published Czech translation with an ambiguous DST time.
  await page.getByTestId('content-tab-cs').click();
  await expect(page.getByTestId('content-locale')).toContainText('Čeština (CS)');
  await page.getByTestId('editor-title').fill('[Ukázka] Turnajový víkend Wardogs – aktualizace');
  await page.getByTestId('editor-save').click();
  await expectSaved(page);
  const form = page.getByTestId('schedule-form');
  await form.locator('#schedule-date').fill('2026-10-25');
  await form.locator('#schedule-time').fill('02:30');
  await expect(form.getByRole('group', { name: /Tento čas nastane dvakrát/ })).toBeVisible();
  await form.getByLabel(/Druhý výskyt/).check();
  await page.getByTestId('schedule-section').scrollIntoViewIfNeeded();
  await shot(page, '05a-schedule-dst.png', 'Schedule panel for an UPDATE of the live Czech article: explicit date, time and IANA time zone (Europe/Prague), DST fall-back ambiguity choice (second occurrence, GMT+1) and the resolved instant in words with UTC.', { uiLocale: 'cs', contentLocale: 'cs' });
  await form.getByTestId('schedule-submit').click();
  await expect(page.getByTestId('schedule-active')).toBeVisible();
  await expect(page.getByTestId('translation-state')).toHaveAttribute('data-state', 'published_update_scheduled');
  await page.getByTestId('schedule-section').scrollIntoViewIfNeeded();
  await shot(page, '05b-schedule-active.png', 'Active schedule: "Publikováno · naplánovaná aktualizace" — the live Czech version stays public; due time with zone and offset, issuer, cancel action.', { uiLocale: 'cs', contentLocale: 'cs' });

  // Private preview of the English draft.
  const preview = await context.newPage();
  await preview.goto(`/cs/admin/news/${state.documentId}/preview?lang=en`);
  await expect(preview.getByTestId('preview-banner')).toBeVisible();
  await shot(preview, '06-preview-banner.png', 'Private preview (content.read_private, no-store, noindex) of the English draft with the prominent "NEZVEŘEJNĚNÝ NÁHLED" banner, rendered with the shared server-side RichText renderer, cover and caption.', { uiLocale: 'cs', contentLocale: 'en' });
  await shot(preview, '06b-preview-full.png', 'Full-page preview: heading, bold text, list, inline image with caption, table and tags rendered like the public article.', { uiLocale: 'cs', contentLocale: 'en', fullPage: true });
  await context.close();
});

test('posts list in Czech at 1920×1080', async ({ browser }) => {
  const { context, page } = await newContext(browser, 1920, 1080);
  await page.goto('/cs/admin/news');
  await expect(page.getByTestId('admin-news')).toBeVisible();
  await shot(page, '01-posts-list-cs-1920x1080.png', 'Posts workspace (Czech UI, 1920×1080): "NOVÝ PŘÍSPĚVEK", search and state/language filters in the URL, author, category, modification time and SEPARATE Czech/English state columns (published, draft, scheduled update, missing, archived) with schedule times.', { uiLocale: 'cs' });
  await context.close();
});

test('media library with an upload error', async ({ browser }) => {
  const { context, page } = await newContext(browser, 1920, 1080);
  await page.goto('/cs/admin/media');
  await page.getByTestId('media-upload-input').setInputFiles({ name: 'nebezpecny-soubor.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') });
  await expect(page.getByTestId('upload-item').first()).toHaveAttribute('data-state', 'failed');
  await page.getByTestId('media-card').filter({ hasText: state.coverName ?? 'ukazka' }).first().click();
  await expect(page.getByTestId('media-detail')).toBeVisible();
  await shot(page, '07-media-library-upload-error.png', 'Media library (editorial scope): "NAHRÁT OBRÁZEK", rejected SVG with the localized unsupported-file error, thumbnail grid with dimensions and in-use badges, detail panel with usage references and library default alt/caption per language.', { uiLocale: 'cs' });
  await context.close();
});

test('editor on a 390×844 phone', async ({ browser }) => {
  const { context, page } = await newContext(browser, 390, 844);
  await page.goto(`/cs/admin/news/${state.documentId}?lang=cs`);
  await expect(page.getByTestId('news-editor')).toBeVisible();
  await canvas(page).scrollIntoViewIfNeeded();
  await shot(page, '08-editor-mobile-390x844.png', 'Editor at 390×844: stacked layout, wrapping toolbar, sticky save/preview/update bar with ≥44 px targets; no horizontal page scroll.', { uiLocale: 'cs', contentLocale: 'cs' });
  await page.getByTestId('editor-panel').scrollIntoViewIfNeeded();
  await shot(page, '08b-editor-mobile-panel.png', 'Phone layout: the document/publication panel is stacked below the canvas as collapsible sections.', { uiLocale: 'cs', contentLocale: 'cs' });
  await context.close();
});

test('English interface posts list at 1440×900', async ({ browser }) => {
  const { context, page } = await newContext(browser, 1440, 900, 'en');
  await page.goto('/en/admin/news');
  await expect(page.getByRole('heading', { level: 1, name: 'News' })).toBeVisible();
  await shot(page, '09-posts-list-en-1440x900.png', 'English interface posts list at 1440×900: "NEW POST", localized filters and state labels ("Published · update scheduled"), separate Czech/English columns.', { uiLocale: 'en' });
  await context.close();
});
