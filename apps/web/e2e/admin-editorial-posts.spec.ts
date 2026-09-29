import { expect, test, type Page } from '@playwright/test';
import {
  activeScheduleCount,
  canvas,
  createPost,
  expectPublicNews,
  expectSaved,
  fillPublishable,
  publish,
  storedTranslation,
  syntheticPng,
  uniqueSuffix,
} from './admin-editorial-helpers';
import { signInAs } from './support/auth';

/**
 * Editorial acceptance journeys (docs/product/editorial-and-matches.md): formatted post
 * with cover and inline image, save/reload/preview/publish, draft-only autosave after
 * publication, restore-to-draft, scheduled update + cancellation and an independent
 * English translation. Czech UI throughout unless stated.
 */

test.describe.configure({ mode: 'serial' });

async function uploadInPicker(page: Page, name: string, color: string) {
  const picker = page.getByTestId('media-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId('media-upload-input').setInputFiles({ name, mimeType: 'image/png', buffer: await syntheticPng(800, 450, color) });
  await expect(picker.getByTestId('upload-item').first()).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
  return picker;
}

test('an editor creates a formatted post with cover and inline image, saves, reloads, previews and publishes Czech only', async ({ context, page, request }) => {
  await signInAs(context, { roles: ['editor'], name: 'Synthetická redaktorka' });
  const suffix = uniqueSuffix();
  const title = `[E2E] Turnajový report ${suffix}`;

  await page.goto('/cs/admin/news');
  await expect(page.getByRole('heading', { level: 1, name: 'Novinky' })).toBeVisible();
  await page.getByTestId('new-post').click();
  await expect(page).toHaveURL(/\/cs\/admin\/news\/new$/);
  // Content language defaults to Czech, independent of the interface language.
  await expect(page.getByLabel(/^Čeština \(CS\)/)).toBeChecked();
  await page.getByTestId('new-post-title').fill(title);
  await page.getByTestId('new-post-submit').click();
  await expect(page).toHaveURL(/\/cs\/admin\/news\/[0-9a-f-]{36}\?lang=cs$/);
  const documentId = /news\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  await expect(page.getByTestId('content-locale')).toContainText('Čeština (CS)');
  await expect(page.getByTestId('ui-locale')).toContainText('Čeština');
  await expect(page.getByTestId('editor-title')).toHaveValue(title);
  const slug = await page.getByTestId('editor-slug').inputValue();
  expect(slug).toBe(`e2e-turnajovy-report-${suffix}`);

  // Visual formatting through the toolbar and keyboard shortcuts.
  const body = canvas(page);
  await body.click();
  await page.getByLabel('Typ odstavce').selectOption('heading2');
  await page.keyboard.type('Úvod turnaje');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Tým hrál ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('velmi dobře');
  await page.keyboard.press('Control+b');
  await page.keyboard.type(' celý večer.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Výsledky');
  await body.getByText('Výsledky', { exact: true }).click({ clickCount: 3 });
  await page.getByRole('button', { name: 'Odkaz', exact: true }).click();
  await page.getByLabel('Adresa odkazu').fill('https://example.com/vysledky');
  await page.keyboard.press('Enter');
  // The panel closes and focus returns to the editor on the next frame, caret after the link.
  await expect(page.getByLabel('Adresa odkazu')).toBeHidden();
  await expect(body).toBeFocused();
  await expect(body.locator('a[href="https://example.com/vysledky"]')).toHaveText('Výsledky');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Odrážkový seznam' }).click();
  await page.keyboard.type('První kolo');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Druhé kolo');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  // Inline image through the media picker: upload, alt text required, insert.
  await page.getByRole('button', { name: 'Vložit obrázek' }).click();
  let picker = await uploadInPicker(page, `inline-${suffix}.png`, '#2d4f6c');
  await picker.getByTestId('media-picker-confirm').click();
  await expect(picker.getByText('Doplňte alternativní text, nebo obrázek označte jako dekorativní.')).toBeVisible();
  await picker.getByLabel(/^Alternativní text \(Čeština\)/).fill('Mapa bojiště v ukázce');
  await picker.getByTestId('media-picker-confirm').click();
  await expect(picker).toBeHidden();
  await expect(body.locator('figure img')).toHaveCount(1);
  // The caret continues after the inserted image, so the next toolbar action goes after it:
  // a basic table with a header row (typing into the first header cell) keeps the image.
  await page.getByRole('button', { name: 'Vložit tabulku' }).click();
  await page.keyboard.type('Mapa');
  await expect(body.locator('figure img')).toHaveCount(1);
  expect(await body.evaluate((element) => Boolean(element.querySelector('figure')!.compareDocumentPosition(element.querySelector('table')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);

  // Cover image through the same library.
  await page.getByTestId('cover-choose').click();
  picker = await uploadInPicker(page, `cover-${suffix}.png`, '#6c3b2d');
  await picker.getByLabel(/^Alternativní text \(Čeština\)/).fill('Titulní obrázek ukázky');
  await picker.getByLabel(/^Popisek \(Čeština\)/).fill('Syntetický titulní obrázek');
  await picker.getByTestId('media-picker-confirm').click();
  await expect(page.getByTestId('cover-thumb')).toBeVisible();
  await expect(page.getByTestId('cover-alt')).toHaveValue('Titulní obrázek ukázky');

  await page.getByTestId('editor-excerpt').fill('Krátký perex turnajového reportu.');
  await page.getByTestId('editor-category').selectOption('announcement');
  await page.getByTestId('editor-save').click();
  await expectSaved(page);
  const coverSrc = await page.getByTestId('cover-thumb').getAttribute('src');
  const coverAssetId = /media\/([0-9a-f-]{36})\//.exec(coverSrc ?? '')![1]!;

  // Draft media stay private.
  expect((await request.get(`/api/media/${coverAssetId}/thumb`)).status()).toBe(404);

  // Reload: everything persisted server-side (nothing from browser storage).
  await page.reload();
  await expect(page.getByTestId('editor-title')).toHaveValue(title);
  await expect(body.locator('h2')).toHaveText('Úvod turnaje');
  await expect(body.locator('strong')).toHaveText('velmi dobře');
  await expect(body.locator('a[href="https://example.com/vysledky"]')).toHaveText('Výsledky');
  await expect(body.locator('ul li')).toHaveCount(2);
  await expect(body.locator('table th').first()).toHaveText('Mapa');
  await expect(body.locator('figure img')).toHaveCount(1);
  await expect(page.getByTestId('cover-alt')).toHaveValue('Titulní obrázek ukázky');
  await expect(page.getByTestId('editor-excerpt')).toHaveValue('Krátký perex turnajového reportu.');

  // Private preview: banner, same renderer, no-store + noindex.
  const [preview] = await Promise.all([context.waitForEvent('page'), page.getByTestId('editor-preview').click()]);
  await preview.waitForLoadState('domcontentloaded');
  await expect(preview).toHaveURL(/\/cs\/admin\/news\/[0-9a-f-]{36}\/preview\?lang=cs$/);
  await expect(preview.getByTestId('preview-banner')).toContainText('NEZVEŘEJNĚNÝ NÁHLED');
  // Role-based checks so the shared public ArticleView can render the preview as well.
  await expect(preview.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const article = preview.locator('article');
  await expect(article.locator('strong')).toHaveText('velmi dobře');
  await expect(article.locator('table')).toBeVisible();
  await expect(article.getByRole('img', { name: 'Mapa bojiště v ukázce' })).toBeVisible();
  await expect(article.locator('figure').first().getByRole('img', { name: 'Titulní obrázek ukázky' })).toBeVisible();
  await expect(preview.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  // Authorized, private and uncacheable; an anonymous request gets no preview.
  const privateResponse = await preview.request.get(preview.url());
  expect(privateResponse.status()).toBe(200);
  expect(privateResponse.headers()['cache-control']).toContain('no-store');
  const anonymousPreview = await request.get(preview.url(), { maxRedirects: 0 });
  expect(anonymousPreview.status()).toBe(307);
  expect(anonymousPreview.headers().location).toContain('/cs/login?returnTo=');
  await preview.close();

  // Publish Czech only; English does not exist and stays absent publicly.
  await expectPublicNews(request, 'cs', slug, null);
  await publish(page);
  await expect(page.getByTestId('live-link')).toHaveAttribute('href', `/cs/news/${slug}`);
  const cs = await storedTranslation(documentId, 'cs');
  expect(cs).toMatchObject({ liveSlug: slug, publishedTitle: title });
  expect(await storedTranslation(documentId, 'en')).toBeNull();
  await expectPublicNews(request, 'cs', slug, { title });
  await expectPublicNews(request, 'en', slug, null);
  // The published cover becomes anonymously deliverable.
  expect((await request.get(`/api/media/${coverAssetId}/thumb`)).status()).toBe(200);

  // The posts list shows separate Czech/English states.
  await page.goto(`/cs/admin/news?q=${encodeURIComponent(suffix)}`);
  const row = page.getByRole('row', { name: new RegExp(suffix) });
  await expect(row.getByTestId('state-cs')).toHaveAttribute('data-state', 'published');
  await expect(row.getByTestId('state-en')).toHaveAttribute('data-state', 'missing');
  await expect(row).toContainText('Oznámení');
});

test('autosave after publication changes only the draft; a restored revision stays private until the update is published', async ({ context, page, request }) => {
  await signInAs(context, { roles: ['editor'] });
  const suffix = uniqueSuffix();
  const original = `[E2E] Živý článek ${suffix}`;
  const documentId = await createPost(page, original);
  await fillPublishable(page, 'Původní text článku.', 'Původní perex.');
  await publish(page);
  const slug = (await storedTranslation(documentId, 'cs'))!.liveSlug!;

  // Autosave (no click): debounced server draft save, never publication.
  const autosaved = `[E2E] Automaticky uložená změna ${suffix}`;
  await page.getByTestId('editor-title').fill(autosaved);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'dirty');
  await expect(page.getByTestId('save-state')).toHaveText('Neuložené změny');
  await expectSaved(page, 20_000);
  await expect(page.getByTestId('translation-state')).toHaveAttribute('data-state', 'published_with_changes');
  let stored = await storedTranslation(documentId, 'cs');
  expect(stored).toMatchObject({ draftTitle: autosaved, publishedTitle: original, liveSlug: slug });
  await expectPublicNews(request, 'cs', slug, { title: original });

  // A later manual save, then restore the autosaved revision into the draft.
  await page.getByTestId('editor-title').fill(`[E2E] Další změna ${suffix}`);
  await page.getByTestId('editor-save').click();
  await expectSaved(page);
  await page.getByTestId('revisions-section').locator('summary').click();
  const autosaveItem = page.getByTestId('revision-item').filter({ hasText: autosaved }).filter({ hasText: 'Automatické uložení' }).first();
  await expect(autosaveItem).toBeVisible();
  await autosaveItem.getByTestId('revision-restore').click();
  await page.locator('[data-confirm="confirm"]').click();
  await expect(page.getByTestId('editor-restored')).toBeVisible();
  await expect(page.getByTestId('editor-title')).toHaveValue(autosaved);
  stored = await storedTranslation(documentId, 'cs');
  expect(stored).toMatchObject({ draftTitle: autosaved, publishedTitle: original });
  await expectPublicNews(request, 'cs', slug, { title: original });

  // Explicit update publishes the restored draft.
  await expect(page.getByTestId('editor-publish')).toHaveText('Aktualizovat češtinu');
  await page.getByTestId('editor-publish').click();
  await expect(page.getByTestId('editor-published')).toBeVisible();
  stored = await storedTranslation(documentId, 'cs');
  expect(stored).toMatchObject({ publishedTitle: autosaved });
  await expectPublicNews(request, 'cs', stored!.liveSlug!, { title: autosaved });
});

test('scheduling an update keeps the live article; cancelling leaves title and slug unchanged', async ({ context, page, request }) => {
  await signInAs(context, { roles: ['editor'] });
  const suffix = uniqueSuffix();
  const original = `[E2E] Plánovaný článek ${suffix}`;
  const documentId = await createPost(page, original);
  await fillPublishable(page, 'Zveřejněný text.', 'Zveřejněný perex.');
  await publish(page);
  const live = (await storedTranslation(documentId, 'cs'))!;

  await page.getByTestId('editor-title').fill(`[E2E] Budoucí titulek ${suffix}`);
  await page.getByTestId('editor-slug').fill(`e2e-budouci-adresa-${suffix}`);
  await page.getByTestId('editor-save').click();
  await expectSaved(page);

  const form = page.getByTestId('schedule-form');
  await expect(form.getByLabel('Časové pásmo')).toHaveValue('Europe/Prague');
  await form.locator('#schedule-time').fill('10:15');
  await expect(page.getByTestId('schedule-resolved')).toContainText('Česká verze se zveřejní');
  await expect(page.getByTestId('schedule-resolved')).toContainText('UTC');
  await form.getByTestId('schedule-submit').click();
  await expect(page.getByTestId('editor-scheduled')).toBeVisible();
  await expect(page.getByTestId('schedule-active')).toBeVisible();
  await expect(page.getByTestId('translation-state')).toHaveAttribute('data-state', 'published_update_scheduled');
  expect(await activeScheduleCount(documentId)).toBe(1);
  // The live version is untouched while the update waits.
  expect(await storedTranslation(documentId, 'cs')).toMatchObject({ liveSlug: live.liveSlug, publishedTitle: original, publishedRevisionId: live.publishedRevisionId });
  await expectPublicNews(request, 'cs', live.liveSlug!, { title: original });

  await page.goto(`/cs/admin/news?q=${encodeURIComponent(suffix)}`);
  await expect(page.getByRole('row', { name: new RegExp(suffix) }).getByTestId('state-cs')).toHaveAttribute('data-state', 'published_update_scheduled');
  await page.goBack();

  await page.getByTestId('schedule-cancel').click();
  await page.locator('[data-confirm="confirm"]').click();
  await expect(page.getByTestId('editor-schedule-cancelled')).toBeVisible();
  await expect(page.getByTestId('schedule-form')).toBeVisible();
  expect(await activeScheduleCount(documentId)).toBe(0);
  const after = await storedTranslation(documentId, 'cs');
  expect(after).toMatchObject({ liveSlug: live.liveSlug, publishedTitle: original, publishedRevisionId: live.publishedRevisionId });
  await expectPublicNews(request, 'cs', live.liveSlug!, { title: original });
  await expectPublicNews(request, 'cs', `e2e-budouci-adresa-${suffix}`, null);
});

test('an English translation starts empty and is published independently of Czech', async ({ context, page, request }) => {
  await signInAs(context, { roles: ['editor'] });
  const suffix = uniqueSuffix();
  const czechTitle = `[E2E] Český originál ${suffix}`;
  const documentId = await createPost(page, czechTitle);
  await fillPublishable(page, 'Český text.', 'Český perex.');
  await publish(page);
  const czech = (await storedTranslation(documentId, 'cs'))!;

  await expect(page.getByTestId('add-translation-en')).toHaveText('Přidat anglický překlad');
  await page.getByTestId('add-translation-en').click();
  await expect(page).toHaveURL(new RegExp(`/cs/admin/news/${documentId}\\?lang=en$`));
  await expect(page.getByTestId('content-locale')).toContainText('Angličtina (EN)');
  // Czech UI editing English content; nothing was copied or translated.
  await expect(page.getByTestId('editor-title')).toHaveValue('');
  await expect(canvas(page, 'en')).not.toContainText('Český text');
  await expect(page.getByTestId('content-tab-cs')).toContainText('Publikováno');
  await expect(page.getByTestId('content-tab-en')).toContainText('Koncept');

  const englishTitle = `[E2E] English version ${suffix}`;
  await page.getByTestId('editor-title').fill(englishTitle);
  await expect(page.getByTestId('editor-slug')).toHaveValue(`e2e-english-version-${suffix}`);
  await fillPublishable(page, 'English text.', 'English excerpt.', 'en');
  await expect(page.getByTestId('editor-publish')).toHaveText('Publikovat angličtinu');
  await publish(page);

  const english = (await storedTranslation(documentId, 'en'))!;
  expect(english).toMatchObject({ publishedTitle: englishTitle, liveSlug: `e2e-english-version-${suffix}` });
  // Czech revision, slug and title are untouched by the English publication.
  expect(await storedTranslation(documentId, 'cs')).toMatchObject({ publishedRevisionId: czech.publishedRevisionId, liveSlug: czech.liveSlug, publishedTitle: czechTitle, version: czech.version });
  await expectPublicNews(request, 'en', english.liveSlug!, { title: englishTitle });
  await expectPublicNews(request, 'cs', czech.liveSlug!, { title: czechTitle });
  await expect(page.getByTestId('content-tab-cs')).toContainText('Publikováno');
});

test('list row actions publish per language, duplicate, archive and unarchive with confirmation', async ({ context, page, request }) => {
  await signInAs(context, { roles: ['editor'] });
  const suffix = uniqueSuffix();
  const title = `[E2E] Řádkové akce ${suffix}`;
  const documentId = await createPost(page, title);
  await fillPublishable(page, 'Text pro akce v seznamu.', 'Perex pro akce v seznamu.');

  await page.goto(`/cs/admin/news?q=${encodeURIComponent(suffix)}`);
  const row = () => page.getByRole('row', { name: new RegExp(`Řádkové akce ${suffix}`) }).first();
  await expect(row().getByTestId('state-cs')).toHaveAttribute('data-state', 'draft');
  await row().getByTestId('row-actions').click();
  const dialog = page.getByRole('dialog', { name: 'Akce příspěvku' });
  await dialog.getByTestId('row-publish-cs').click();
  await expect(page.getByRole('dialog', { name: 'Zveřejnit českou verzi?' })).toContainText('Anglická verze se nemění.');
  await page.getByTestId('row-confirm').click();
  await expect(row().getByTestId('state-cs')).toHaveAttribute('data-state', 'published');
  const slug = (await storedTranslation(documentId, 'cs'))!.liveSlug!;
  await expectPublicNews(request, 'cs', slug, { title });

  // Archive hides the post in both languages; unarchive restores the published state.
  await row().getByTestId('row-actions').click();
  await page.getByTestId('row-archive').click();
  await page.getByTestId('row-confirm').click();
  await expect(row().getByTestId('state-cs')).toHaveAttribute('data-state', 'archived');
  await expectPublicNews(request, 'cs', slug, null);
  await row().getByTestId('row-actions').click();
  await page.getByTestId('row-unarchive').click();
  await page.getByTestId('row-confirm').click();
  await expect(row().getByTestId('state-cs')).toHaveAttribute('data-state', 'published');
  await expectPublicNews(request, 'cs', slug, { title });

  // Duplicate creates an unpublished copy and opens it.
  await row().getByTestId('row-actions').click();
  await page.getByTestId('row-duplicate').click();
  await page.getByTestId('row-confirm').click();
  await expect(page).toHaveURL(/\/cs\/admin\/news\/[0-9a-f-]{36}\?lang=cs$/);
  expect(page.url()).not.toContain(documentId);
  await expect(page.getByTestId('editor-title')).toHaveValue(title);
  await expect(page.getByTestId('editor-slug')).toHaveValue(`${slug}-copy`);
  await expect(page.getByTestId('translation-state')).toHaveAttribute('data-state', 'draft');
});

test('the overview lists own drafts and scheduled publications; core pages use the same editor with a fixed slug', async ({ context, page, request }) => {
  await signInAs(context, { roles: ['editor'] });
  const suffix = uniqueSuffix();
  const draftTitle = `[E2E] Můj koncept ${suffix}`;
  await createPost(page, draftTitle);
  const scheduledTitle = `[E2E] Naplánovaný ${suffix}`;
  const scheduledId = await createPost(page, scheduledTitle);
  await fillPublishable(page, 'Plánovaný text.', 'Plánovaný perex.');
  await page.getByTestId('schedule-submit').click();
  await expect(page.getByTestId('schedule-active')).toBeVisible();

  await page.goto('/cs/admin');
  await expect(page.getByTestId('admin-module-content')).toContainText('Stránky');
  await expect(page.getByTestId('admin-nav').getByRole('link', { name: 'Stránky' })).toBeVisible();
  await expect(page.getByTestId('overview-drafts')).toContainText(draftTitle);
  const scheduled = page.getByTestId('overview-schedules').getByRole('listitem').filter({ hasText: scheduledTitle });
  await expect(scheduled).toContainText('Naplánováno');
  await scheduled.getByRole('link', { name: scheduledTitle }).click();
  await expect(page).toHaveURL(new RegExp(`/cs/admin/news/${scheduledId}\\?lang=cs$`));

  // Core pages: per-language states, fixed slug, no post-only sections.
  await page.goto('/cs/admin/content');
  const clan = page.getByRole('row', { name: /Klan/ });
  await expect(clan.getByTestId('state-cs')).toHaveAttribute('data-state', /published/);
  await expect(clan.getByTestId('state-en')).toHaveAttribute('data-state', /published/);
  await clan.getByTestId('row-edit').click();
  await expect(page).toHaveURL(/\/cs\/admin\/content\/[0-9a-f-]{36}\?lang=cs$/);
  const pageId = /content\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  await expect(page.getByRole('heading', { level: 1, name: 'Stránka: Klan' })).toBeVisible();
  await expect(page.getByTestId('news-editor')).toHaveAttribute('data-mode', 'page');
  await expect(page.getByTestId('editor-panel')).toContainText('/cs/clan');
  await expect(page.getByTestId('editor-slug')).toHaveCount(0);
  await expect(page.getByTestId('taxonomy-section')).toHaveCount(0);
  await expect(page.getByTestId('schedule-section')).toHaveCount(0);
  await expect(page.getByTestId('editor-archive')).toHaveCount(0);
  const live = (await storedTranslation(pageId, 'cs'))!;

  // A draft change is private: preview shows it, the live page revision is untouched.
  await page.getByTestId('editor-excerpt').fill(`Koncept perexu stránky ${suffix}`);
  await page.getByTestId('editor-save').click();
  await expectSaved(page);
  await expect(page.getByTestId('translation-state')).toHaveAttribute('data-state', 'published_with_changes');
  const preview = await page.context().newPage();
  await preview.goto(`/cs/admin/content/${pageId}/preview?lang=cs`);
  await expect(preview.getByTestId('preview-banner')).toContainText('NEZVEŘEJNĚNÝ NÁHLED');
  await expect(preview.locator('article')).toContainText(`Koncept perexu stránky ${suffix}`);
  await preview.close();
  expect(await storedTranslation(pageId, 'cs')).toMatchObject({ publishedRevisionId: live.publishedRevisionId, liveSlug: 'clan' });
  const publicClan = await request.get('/cs/clan');
  if (publicClan.status() === 200) expect(await publicClan.text()).not.toContain(`Koncept perexu stránky ${suffix}`);

  // Restore the published revision into the draft again so shared fixtures stay pristine.
  await page.getByTestId('revisions-section').locator('summary').click();
  await page.getByTestId('revision-item').filter({ hasText: 'Zveřejněno' }).getByTestId('revision-restore').click();
  await page.locator('[data-confirm="confirm"]').click();
  await expect(page.getByTestId('editor-restored')).toBeVisible();
  await expect(page.getByTestId('editor-excerpt')).not.toHaveValue(`Koncept perexu stránky ${suffix}`);
});
