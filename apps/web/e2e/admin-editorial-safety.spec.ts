import { type APIRequestContext, expect, test } from '@playwright/test';
import { canvas, createPost, expectSaved, fillPublishable, storedTranslation, uniqueSuffix } from './admin-editorial-helpers';
import { ageMembershipSnapshot, E2E_BASE_URL, setDiscordMember, signInAs } from './support/auth';
import { measuredBox } from './support/shell-helpers';

/**
 * Safety journeys of the editorial administration: same-translation conflicts keep the
 * local text, authorization is enforced by the server (pages, server actions, upload
 * API), unsaved work is guarded on UI-language and content-language switches, and the
 * editor stays usable on a 390 px phone.
 */

test('a stale version shows an explicit conflict, keeps local text and never overwrites silently', async ({ browser, context, page }) => {
  await signInAs(context, { roles: ['editor'], name: 'Synthetic editor A' });
  const suffix = uniqueSuffix();
  const documentId = await createPost(page, `[E2E] Konflikt ${suffix}`);
  await fillPublishable(page, 'Společný text.', 'Společný perex.');

  // A second editor saves the same Czech translation in the meantime.
  const other = await browser.newContext();
  await signInAs(other, { roles: ['editor'], name: 'Synthetic editor B' });
  const otherPage = await other.newPage();
  await otherPage.goto(`/cs/admin/news/${documentId}?lang=cs`);
  const theirs = `[E2E] Verze kolegy ${suffix}`;
  await otherPage.getByTestId('editor-title').fill(theirs);
  await otherPage.getByTestId('editor-save').click();
  await expectSaved(otherPage);

  // Editor A keeps typing; the debounced autosave hits the stale version.
  const mine = `[E2E] Moje neuložená verze ${suffix}`;
  await page.getByTestId('editor-title').fill(mine);
  await expect(page.getByTestId('conflict-notice')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'conflict');
  await expect(page.getByTestId('conflict-notice')).toContainText('Českou verzi mezitím uložil někdo jiný');
  await expect(page.getByTestId('conflict-server')).toContainText(theirs);
  await expect(page.getByTestId('conflict-server')).toContainText('Synthetic editor B');
  await expect(page.getByTestId('editor-title')).toHaveValue(mine);
  expect((await storedTranslation(documentId, 'cs'))!.draftTitle).toBe(theirs);

  // Further typing does not autosave over the other editor.
  await page.getByTestId('editor-title').fill(`${mine} 2`);
  await page.waitForTimeout(5_000);
  expect((await storedTranslation(documentId, 'cs'))!.draftTitle).toBe(theirs);

  // Explicit overwrite after review (confirmation) saves my version…
  await page.getByTestId('conflict-overwrite').click();
  await page.locator('[data-confirm="confirm"]').click();
  await expectSaved(page);
  expect((await storedTranslation(documentId, 'cs'))!.draftTitle).toBe(`${mine} 2`);

  // …and the other editor now gets the conflict; loading the latest discards their unsent text.
  await otherPage.getByTestId('editor-title').fill(`${theirs} B2`);
  await otherPage.getByTestId('editor-save').click();
  await expect(otherPage.getByTestId('conflict-notice')).toBeVisible();
  await otherPage.getByTestId('conflict-reload').click();
  await expect(otherPage.getByTestId('editor-title')).toHaveValue(`${mine} 2`);
  await expect(otherPage.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await other.close();
});

test('a revoked editor role blocks the save on the server and keeps the unsent text', async ({ context, page }) => {
  const editor = await signInAs(context, { roles: ['editor'] });
  const suffix = uniqueSuffix();
  const documentId = await createPost(page, `[E2E] Odebraná role ${suffix}`);
  const before = await storedTranslation(documentId, 'cs');

  await ageMembershipSnapshot(editor.discordUserId, 120);
  await setDiscordMember(editor.discordUserId, { roles: [] });
  await page.getByTestId('editor-title').fill(`[E2E] Neuloženo ${suffix}`);
  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('save-failed-notice')).toContainText('K této akci nemáte oprávnění.');
  await expect(page.getByTestId('save-state')).toHaveText('Uložení se nezdařilo');
  await expect(page.getByTestId('editor-title')).toHaveValue(`[E2E] Neuloženo ${suffix}`);
  expect(await storedTranslation(documentId, 'cs')).toMatchObject({ version: before!.version, draftTitle: before!.draftTitle });
});

test('match managers and members cannot use the editorial workspace, its server actions or editorial uploads', async ({ browser, context, page }) => {
  // Capture a genuine save server-action request from an editor.
  await signInAs(context, { roles: ['editor'] });
  const documentId = await createPost(page, `[E2E] Oprávnění ${uniqueSuffix()}`);
  // Unique title: the draft slug follows it and must not collide with parallel runs.
  await page.getByTestId('editor-title').fill(`[E2E] Pokus o zápis ${uniqueSuffix()}`);
  const [actionRequest] = await Promise.all([
    page.waitForRequest((request) => request.method() === 'POST' && Boolean(request.headers()['next-action'])),
    page.getByTestId('editor-save').click(),
  ]);
  await expectSaved(page);
  const before = (await storedTranslation(documentId, 'cs'))!;
  const replay = (requestContext: APIRequestContext) =>
    requestContext.post(actionRequest.url(), {
      headers: {
        'next-action': actionRequest.headers()['next-action']!,
        'content-type': actionRequest.headers()['content-type'] ?? 'text/plain;charset=UTF-8',
        accept: 'text/x-component',
        origin: E2E_BASE_URL,
      },
      data: actionRequest.postData() ?? '',
    });

  const matchManager = await browser.newContext();
  await signInAs(matchManager, { roles: ['match_manager'] });
  const mmPage = await matchManager.newPage();
  for (const path of ['/cs/admin/news', '/cs/admin/news/new', `/cs/admin/news/${documentId}`, `/cs/admin/news/${documentId}/preview?lang=cs`, '/cs/admin/content']) {
    await mmPage.goto(path);
    await expect(mmPage.getByTestId('access-denied'), path).toHaveAttribute('data-reason', 'forbidden');
    await expect(mmPage.getByTestId('news-editor')).toHaveCount(0);
  }
  await expect(mmPage.getByTestId('admin-nav').getByRole('link', { name: 'Novinky' })).toHaveCount(0);

  // Direct server-action call with the match manager's session is denied server-side.
  const denied = await replay(matchManager.request);
  expect(await denied.text()).toContain('"code":"forbidden"');
  // Anonymous replay is denied as well.
  const anonymous = await browser.newContext();
  expect(await (await replay(anonymous.request)).text()).toContain('"code":"unauthenticated"');
  expect(await storedTranslation(documentId, 'cs')).toMatchObject({ version: before.version, draftTitle: before.draftTitle });

  // Editorial uploads are refused for match managers; the media library shows only match scope.
  const upload = await matchManager.request.post('/api/media/upload?scope=editorial', {
    headers: { origin: E2E_BASE_URL },
    multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') } },
  });
  expect(upload.status()).toBe(403);
  expect(await upload.json()).toEqual({ ok: false, code: 'forbidden' });
  await mmPage.goto('/cs/admin/media');
  await expect(mmPage.getByTestId('admin-media')).toHaveAttribute('data-scopes', 'match');

  const member = await browser.newContext();
  await signInAs(member, { roles: ['member'] });
  const memberPage = await member.newPage();
  for (const path of ['/cs/admin/news', '/cs/admin/media', '/cs/admin/content']) {
    await memberPage.goto(path);
    await expect(memberPage.getByTestId('access-denied'), path).toBeVisible();
  }
  expect(await (await replay(member.request)).text()).toContain('"code":"forbidden"');
  await Promise.all([matchManager.close(), anonymous.close(), member.close()]);
});

test('unsaved changes are guarded when switching the interface or the content language, without cross-saving', async ({ context, page }) => {
  await signInAs(context, { roles: ['editor'] });
  const suffix = uniqueSuffix();
  const czechTitle = `[E2E] Chráněný koncept ${suffix}`;
  const documentId = await createPost(page, czechTitle);

  // Interface language switch with a dirty editor asks first; "Stay" keeps everything.
  await page.getByTestId('editor-title').fill(`${czechTitle} – rozepsáno`);
  await page.getByRole('link', { name: 'Přepnout na angličtinu (English)' }).first().click();
  const dialog = page.getByRole('alertdialog', { name: 'Neuložené změny' });
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-unsaved-action="stay"]').click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/cs/admin/news/${documentId}`));
  await expect(page.getByTestId('editor-title')).toHaveValue(`${czechTitle} – rozepsáno`);

  // Adding the English translation while dirty: discarding never moves Czech text into English.
  await page.getByTestId('editor-title').fill(`${czechTitle} – neuložit`);
  await page.getByTestId('add-translation-en').click();
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-unsaved-action="discard"]').click();
  await expect(page).toHaveURL(new RegExp(`/cs/admin/news/${documentId}\\?lang=en$`));
  await expect(page.getByTestId('editor-title')).toHaveValue('');
  expect((await storedTranslation(documentId, 'cs'))!.draftTitle).not.toContain('neuložit');

  // Switching back to Czech with unsaved English text: "Save and continue" saves ENGLISH only.
  const englishTitle = `[E2E] English draft ${suffix}`;
  await page.getByTestId('editor-title').fill(englishTitle);
  await page.getByTestId('content-tab-cs').click();
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-unsaved-action="save"]').click();
  await expect(page).toHaveURL(new RegExp(`/cs/admin/news/${documentId}\\?lang=cs$`));
  expect((await storedTranslation(documentId, 'en'))!.draftTitle).toBe(englishTitle);
  expect((await storedTranslation(documentId, 'cs'))!.draftTitle).not.toBe(englishTitle);

  // UI switch with "Save and continue" saves first, then opens the English interface.
  await page.getByTestId('editor-title').fill(`${czechTitle} – uloženo před přepnutím`);
  await page.getByRole('link', { name: 'Přepnout na angličtinu (English)' }).first().click();
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-unsaved-action="save"]').click();
  await expect(page).toHaveURL(new RegExp(`/en/admin/news/${documentId}`));
  await expect(page.getByTestId('ui-locale')).toContainText('English');
  expect((await storedTranslation(documentId, 'cs'))!.draftTitle).toBe(`${czechTitle} – uloženo před přepnutím`);
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the editor is usable at 390 px with the document panel stacked below the canvas', async ({ context, page }) => {
    await signInAs(context, { roles: ['editor'] });
    const documentId = await createPost(page, `[E2E] Mobil ${uniqueSuffix()}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const body = canvas(page);
    await body.click();
    await page.keyboard.type('Text psaný na telefonu.');
    const canvasBox = await body.boundingBox();
    const panelBox = await page.getByTestId('editor-panel').boundingBox();
    expect(panelBox!.y).toBeGreaterThan(canvasBox!.y + canvasBox!.height - 1);
    expect(panelBox!.width).toBeGreaterThan(300);
    // Save stays reachable in the sticky action bar with a ≥44 px target.
    const save = page.getByTestId('editor-save');
    await expect(save).toBeInViewport();
    expect((await measuredBox(save)).height).toBeGreaterThanOrEqual(44);
    await save.click();
    await expectSaved(page);
    await page.getByTestId('editor-excerpt').fill('Perex z telefonu.');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'dirty');
    expect((await storedTranslation(documentId, 'cs'))!.draftTitle).toContain('[E2E] Mobil');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
