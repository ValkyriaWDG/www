import { expect, type Page, test } from '@playwright/test';
import { editorialDb, uniqueSuffix } from './admin-editorial-helpers';
import { signInAs } from './support/auth';

/**
 * Categories and tags administration (issue #86): Czech/English editing of a Field Manual
 * category with the public manual reflecting it immediately, a news tag offered in the
 * editor and hidden after archiving, a failed save that keeps the entered values, direct
 * URLs denied outside the editor's scope, and a referenced term that cannot be deleted.
 * Synthetic identities against the disposable e2e database; seeded categories are
 * restored at the end of each journey.
 */

test.describe.configure({ mode: 'serial' });

async function manualCategoryId(key: string): Promise<string> {
  const result = await editorialDb().query<{ id: string }>(`select id from manual_category where game = 'hell-let-loose' and key = $1`, [key]);
  if (!result.rows[0]) throw new Error(`No manual category ${key}`);
  return result.rows[0].id;
}

async function storedManualCategory(key: string) {
  const result = await editorialDb().query<{ label_cs: string; label_en: string; description_cs: string; sort_order: number; archived_at: string | null }>(
    `select label_cs, label_en, description_cs, sort_order, archived_at from manual_category where game = 'hell-let-loose' and key = $1`,
    [key],
  );
  return result.rows[0] ?? null;
}

async function storedTag(key: string) {
  const result = await editorialDb().query<{ id: string; label_cs: string; archived_at: string | null }>(`select id, label_cs, archived_at from taxonomy_term where kind = 'tag' and key = $1`, [key]);
  return result.rows[0] ?? null;
}

async function saveForm(page: Page) {
  await page.getByTestId('taxonomy-save').click();
  await expect(page.getByTestId('taxonomy-form-page').getByRole('status').first()).toContainText(/Změny jsou uložené|Changes are saved/);
}

for (const locale of ['cs', 'en'] as const) {
  test(`a platform-wide editor edits a Field Manual category and the public manual reflects it (${locale})`, async ({ context, page }) => {
    test.setTimeout(90_000);
    await signInAs(context, { roles: ['editor'], name: `Synthetic taxonomy editor ${locale}` });
    const original = await storedManualCategory('vehicles');
    expect(original).not.toBeNull();

    await page.goto(`/${locale}/admin`);
    await page.getByTestId('admin-module-taxonomy').getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/taxonomy$`));
    await expect(page.getByTestId('admin-taxonomy')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: locale === 'cs' ? 'Kategorie a štítky' : 'Categories and tags' })).toBeVisible();
    await expect(page.getByTestId('taxonomy-section-manual-hll')).toBeVisible();
    await expect(page.getByTestId('taxonomy-section-news-category')).toBeVisible();
    await expect(page.getByTestId('taxonomy-section-news-tag')).toBeVisible();
    const row = page.getByTestId('taxonomy-row-manual-hll-vehicles');
    await expect(row).toContainText(original!.label_cs);
    await expect(row.locator('[data-references]')).not.toHaveText('0');
    await row.getByTestId('taxonomy-edit').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/taxonomy/manual/hll/[0-9a-f-]{36}$`));
    await expect(page.getByTestId('taxonomy-form')).toHaveAttribute('data-scope', 'manual-category');
    await expect(page.locator('#taxonomy-key')).toHaveValue('vehicles');
    await expect(page.locator('#taxonomy-key')).toHaveAttribute('readonly', '');
    // The publication semantics are stated before saving.
    await expect(page.getByTestId('taxonomy-form-page')).toContainText(locale === 'cs' ? 'projeví ve veřejné příručce okamžitě' : 'take effect in the public Field Manual');

    const suffix = uniqueSuffix();
    const labelCs = `${original!.label_cs} ${suffix}`;
    const labelEn = `${original!.label_en} ${suffix}`;
    const descriptionCs = `Syntetický popis ${suffix}`;
    await page.locator('#taxonomy-label-cs').fill(labelCs);
    await page.locator('#taxonomy-label-en').fill(labelEn);
    await page.locator('#taxonomy-description-cs').fill(descriptionCs);
    await page.locator('#taxonomy-sort-order').fill('5');
    await saveForm(page);
    expect(await storedManualCategory('vehicles')).toMatchObject({ label_cs: labelCs, label_en: labelEn, description_cs: descriptionCs, sort_order: 5 });

    // Public manual: category card (label, description) and the article eyebrow read the live row.
    await page.goto('/cs/hll/field-manual');
    const card = page.locator('[data-manual-category="vehicles"]');
    await expect(card).toContainText(labelCs);
    await expect(card).toContainText(descriptionCs);
    await expect(page.locator('[data-manual-grid="categories"] > li').first()).toContainText(labelCs);
    await page.goto('/cs/hll/field-manual?category=vehicles');
    await expect(page.locator('[data-manual-article]').first()).toContainText(labelCs);
    // The English manual has no published article in this category, so its card does not
    // exist there; the live English label is checked in the English administration list.
    await page.goto('/en/admin/taxonomy');
    await expect(page.getByTestId('taxonomy-row-manual-hll-vehicles')).toContainText(labelEn);

    // Restore the seeded definition through the same form.
    await page.goto(`/${locale}/admin/taxonomy/manual/hll/${await manualCategoryId('vehicles')}`);
    await page.locator('#taxonomy-label-cs').fill(original!.label_cs);
    await page.locator('#taxonomy-label-en').fill(original!.label_en);
    await page.locator('#taxonomy-description-cs').fill(original!.description_cs);
    await page.locator('#taxonomy-sort-order').fill(String(original!.sort_order));
    await saveForm(page);
    expect(await storedManualCategory('vehicles')).toMatchObject({ label_cs: original!.label_cs, sort_order: original!.sort_order });
  });
}

test('a new news tag is offered in the editor, disappears after archiving and can be deleted while unreferenced', async ({ context, page }) => {
  test.setTimeout(90_000);
  await signInAs(context, { roles: ['editor'], name: 'Synthetická redaktorka štítků' });
  const key = `e2e-stitek-${uniqueSuffix()}`;
  await page.goto('/cs/admin/taxonomy');
  await page.getByTestId('taxonomy-new-news-tag').click();
  await expect(page).toHaveURL(/\/cs\/admin\/taxonomy\/news-tag\/new$/);
  await expect(page.getByTestId('taxonomy-form')).toHaveAttribute('data-scope', 'news-tag');

  // Server-side validation: empty labels and a malformed key are reported per field.
  await page.locator('#taxonomy-key').fill('Špatný klíč');
  await page.getByTestId('taxonomy-save').click();
  await expect(page.locator('#taxonomy-key')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#taxonomy-key-error')).toContainText('malá písmena');
  await expect(page.locator('#taxonomy-label-cs')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#taxonomy-label-cs-error')).toContainText('Vyplňte toto pole.');
  expect(await storedTag(key)).toBeNull();

  await page.locator('#taxonomy-key').fill(key);
  await page.locator('#taxonomy-label-cs').fill('E2E štítek');
  await page.locator('#taxonomy-label-en').fill('E2E tag');
  await page.getByTestId('taxonomy-save').click();
  await expect(page).toHaveURL(/\/cs\/admin\/taxonomy\/news-tag\/[0-9a-f-]{36}$/);
  await expect(page.locator('#taxonomy-key')).toHaveValue(key);
  expect(await storedTag(key)).toMatchObject({ label_cs: 'E2E štítek', archived_at: null });
  const editUrl = page.url();

  // The news editor offers the tag with its Czech label.
  await page.goto('/cs/admin/news/new');
  await page.getByTestId('new-post-title').fill(`[E2E] Štítky ${key}`);
  await page.getByTestId('new-post-submit').click();
  await expect(page).toHaveURL(/\/cs\/admin\/news\/[0-9a-f-]{36}\?lang=cs$/);
  const editorUrl = page.url();
  await expect(page.locator(`#editor-tag-${key}`)).toBeVisible();
  await expect(page.getByLabel('E2E štítek', { exact: true })).toBeVisible();

  // Archive with the consequence stated; the picker no longer offers the tag.
  await page.goto(editUrl);
  await page.getByTestId('taxonomy-archive').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Žádný článek ho nepoužívá.');
  await dialog.locator('[data-confirm="confirm"]').click();
  await expect(page.getByTestId('taxonomy-form-page').getByRole('status').first()).toContainText('Záznam je archivovaný.');
  expect((await storedTag(key))?.archived_at).not.toBeNull();
  await page.goto(editorUrl);
  await expect(page.getByTestId('taxonomy-section')).toBeVisible();
  await expect(page.locator(`#editor-tag-${key}`)).toHaveCount(0);

  // Unreferenced: delete is enabled, confirmed and audited; the list no longer shows the tag.
  await page.goto(editUrl);
  await expect(page.getByTestId('taxonomy-restore')).toBeVisible();
  await expect(page.getByTestId('taxonomy-delete')).toBeEnabled();
  await page.getByTestId('taxonomy-delete').click();
  await expect(dialog).toContainText('Záznam nepoužívá žádný článek.');
  await dialog.locator('[data-confirm="confirm"]').click();
  await expect(page).toHaveURL(/\/cs\/admin\/taxonomy$/);
  await expect(page.getByTestId(`taxonomy-row-news-tag-${key}`)).toHaveCount(0);
  expect(await storedTag(key)).toBeNull();
  const audit = await editorialDb().query<{ count: string }>(
    `select count(*)::text as count from audit_event where action in ('taxonomy.create', 'taxonomy.archive', 'taxonomy.delete') and outcome = 'success' and summary->>'key' = $1`,
    [key],
  );
  expect(Number(audit.rows[0]?.count)).toBe(3);
});

test('a failed save keeps the entered values and allows a retry; unsaved changes are guarded', async ({ context, page }) => {
  await signInAs(context, { roles: ['editor'], name: 'Synthetic retry editor' });
  const id = await manualCategoryId('spawns');
  const before = await storedManualCategory('spawns');
  await page.goto(`/en/admin/taxonomy/manual/hll/${id}`);
  const description = `Synthetic retry ${uniqueSuffix()}`;
  await page.locator('#taxonomy-description-en').fill(description);

  await page.route('**/admin/taxonomy/**', (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
  await page.getByTestId('taxonomy-save').click();
  await expect(page.getByTestId('taxonomy-form-page').getByRole('alert')).toContainText('The service is temporarily unavailable.');
  await expect(page.locator('#taxonomy-description-en')).toHaveValue(description);
  await expect(page.locator('#taxonomy-description-en')).toBeEnabled();
  await expect(page.getByTestId('taxonomy-save')).toBeEnabled();
  expect(await storedManualCategory('spawns')).toMatchObject({ description_cs: before!.description_cs, sort_order: before!.sort_order });
  await page.unroute('**/admin/taxonomy/**');

  // Navigation asks first; staying keeps the value, a successful retry stores it.
  await page.getByTestId('admin-nav').locator('[data-admin-nav="taxonomy"]').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-unsaved-action="stay"]').click();
  await expect(page.locator('#taxonomy-description-en')).toHaveValue(description);
  await saveForm(page);
  const stored = await editorialDb().query<{ description_en: string }>(`select description_en from manual_category where id = $1`, [id]);
  expect(stored.rows[0]?.description_en).toBe(description);
  await page.getByTestId('admin-nav').locator('[data-admin-nav="taxonomy"]').click();
  await expect(page).toHaveURL(/\/en\/admin\/taxonomy$/);
  await expect(dialog).toHaveCount(0);
});

test('a referenced category cannot be deleted; the consequence is shown and archiving keeps it public', async ({ context, page }) => {
  await signInAs(context, { roles: ['hll_editor'], name: 'Synthetic HLL taxonomy editor' });
  const id = await manualCategoryId('getting-started');
  await page.goto(`/cs/admin/taxonomy/manual/hll/${id}`);
  await expect(page.getByTestId('taxonomy-reference-count')).not.toContainText('Žádný přiřazený článek');
  await expect(page.getByTestId('taxonomy-delete')).toBeDisabled();
  await expect(page.getByTestId('taxonomy-delete-blocked')).toContainText('Odstranění není možné');

  await page.getByTestId('taxonomy-archive').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(/článk[ya]?.*(ponechá|ponechají)/);
  await dialog.locator('[data-confirm="confirm"]').click();
  await expect(page.getByTestId('taxonomy-form-page').getByRole('status').first()).toContainText('Záznam je archivovaný.');
  await page.goto('/cs/hll/field-manual');
  await expect(page.locator('[data-manual-category="getting-started"]')).toBeVisible();
  await page.goto('/cs/admin/manual/new');
  await page.getByTestId('new-post-title').fill(`[E2E] Archivovaná kategorie ${uniqueSuffix()}`);
  await page.getByTestId('new-post-submit').click();
  await expect(page.getByTestId('editor-category')).toBeVisible();
  await expect(page.getByTestId('editor-category').locator('option[value="getting-started"]')).toHaveCount(0);

  await page.goto(`/cs/admin/taxonomy/manual/hll/${id}`);
  await page.getByTestId('taxonomy-restore').click();
  await dialog.locator('[data-confirm="confirm"]').click();
  await expect(page.getByTestId('taxonomy-form-page').getByRole('status').first()).toContainText('Záznam je obnovený.');
  expect((await storedManualCategory('getting-started'))?.archived_at).toBeNull();
});

test('scoped editors see only their sections and direct URLs outside the scope are denied', async ({ browser }) => {
  const hll = await browser.newContext();
  await signInAs(hll, { roles: ['hll_editor'], name: 'Synthetic HLL editor' });
  const hllPage = await hll.newPage();
  await hllPage.goto('/cs/admin/taxonomy');
  await expect(hllPage.getByTestId('taxonomy-section-manual-hll')).toBeVisible();
  await expect(hllPage.getByTestId('taxonomy-news-denied')).toBeVisible();
  await expect(hllPage.getByTestId('taxonomy-section-news-tag')).toHaveCount(0);
  await hllPage.goto('/cs/admin/taxonomy/news-tag/new');
  await expect(hllPage.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
  await hllPage.goto('/cs/admin/taxonomy/news-category/new');
  await expect(hllPage.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
  await hllPage.goto('/cs/admin/taxonomy/manual/hll/new');
  await expect(hllPage.getByTestId('taxonomy-form')).toHaveAttribute('data-scope', 'manual-category');
  await hll.close();

  const wdg = await browser.newContext();
  await signInAs(wdg, { roles: ['wdg_editor'], name: 'Synthetic Wardogs editor' });
  const wdgPage = await wdg.newPage();
  await wdgPage.goto('/en/admin/taxonomy');
  await expect(wdgPage.getByText('No Field Manual in your scope')).toBeVisible();
  await expect(wdgPage.getByTestId('taxonomy-news-denied')).toBeVisible();
  await expect(wdgPage.getByTestId('taxonomy-new-manual-hll')).toHaveCount(0);
  await wdgPage.goto(`/en/admin/taxonomy/manual/hll/${await manualCategoryId('roles')}`);
  await expect(wdgPage.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
  await expect(wdgPage.getByTestId('taxonomy-form')).toHaveCount(0);
  await wdgPage.goto('/en/admin/taxonomy/manual/hll/new');
  await expect(wdgPage.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
  await wdgPage.goto('/en/admin/taxonomy/news-tag/new');
  await expect(wdgPage.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
  // Unknown scopes are not found rather than guessed.
  const unknown = await wdgPage.goto('/en/admin/taxonomy/manual/wardogs/new');
  expect(unknown?.status()).toBe(404);
  await wdg.close();
});
