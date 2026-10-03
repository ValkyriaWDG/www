import { expect, test } from '@playwright/test';
import { editorialDb, uniqueSuffix } from './admin-editorial-helpers';
import { signInAs } from './support/auth';

for (const locale of ['cs', 'en'] as const) {
  test(`manual search keeps its workspace and selected filters in ${locale}`, async ({ context, page }) => {
    await signInAs(context, { roles: ['hll_editor'], name: 'Synthetic manual editor' });
    await page.goto(`/${locale}/admin`);
    await page.getByTestId('admin-module-manual').getByRole('link').click();
    await expect(page.getByTestId('admin-manual')).toBeVisible();

    await page.locator('[data-filter="state:published"]').click();
    await expect(page.locator('[data-filter="state:published"]')).toHaveAttribute('aria-current', 'true');
    await page.locator(`[data-filter="locale:${locale}"]`).click();
    await expect(page.locator(`[data-filter="locale:${locale}"]`)).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('search').locator('input[name="state"]')).toHaveValue('published');
    await expect(page.getByRole('search').locator('input[name="locale"]')).toHaveValue(locale);
    const query = locale === 'cs' ? 'První nastavení' : 'First game setup';
    await page.getByRole('searchbox').fill(query);
    await page.getByRole('searchbox').press('Enter');

    await expect(page).toHaveURL((url) =>
      url.pathname === `/${locale}/admin/manual` &&
      url.searchParams.get('q') === query &&
      url.searchParams.get('state') === 'published' &&
      url.searchParams.get('locale') === locale,
    );
    await expect(page.getByTestId('admin-manual')).toBeVisible();
    await expect(page.getByTestId('admin-news')).toHaveCount(0);
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('[Ukázka] První nastavení hry');
    await expect(rows.first().getByTestId(`state-${locale}`)).toHaveAttribute('data-state', 'published');

    await rows.first().getByTestId('row-edit').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/manual/[0-9a-f-]{36}\\?lang=cs$`));
    await expect(page.getByTestId('news-editor')).toHaveAttribute('data-mode', 'manual');
    await expect(page.getByTestId('editor-title')).toHaveValue('[Ukázka] První nastavení hry');
  });

  test(`manual metadata asks before navigation and saves only accepted values in ${locale}`, async ({ context, page }) => {
    test.setTimeout(90_000);
    await signInAs(context, { roles: ['hll_editor'], name: 'Synthetic manual editor' });
    await page.setViewportSize(locale === 'cs' ? { width: 1440, height: 900 } : { width: 390, height: 844 });
    await page.goto(`/${locale}/admin/manual/new`);
    await page.getByTestId('new-post-title').fill(`[E2E] Manual metadata ${locale} ${uniqueSuffix()}`);
    await page.getByTestId('new-post-submit').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/manual/[0-9a-f-]{36}\\?lang=cs$`));
    const editorUrl = page.url();
    const documentId = /manual\/([0-9a-f-]{36})/.exec(editorUrl)![1]!;
    const storedMeta = async () => (await editorialDb().query<{ credits: string; source_url: string | null }>(
      'select credits, source_url from manual_article where document_id = $1', [documentId],
    )).rows[0];
    const manualLink = page.getByTestId('admin-nav').locator('[data-admin-nav="manual"]');
    const credits = `Synthetic manual credits ${locale}`;
    await page.locator('#manual-credits').fill(credits);
    await manualLink.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    expect(await storedMeta()).toMatchObject({ credits: '', source_url: null });
    await test.info().attach(`Manual metadata navigation guard (${locale})`, {
      body: await page.screenshot({ animations: 'disabled', caret: 'hide' }), contentType: 'image/png',
    });
    await dialog.locator('[data-unsaved-action="stay"]').click();
    await expect(page).toHaveURL(editorUrl);
    await expect(page.locator('#manual-credits')).toHaveValue(credits);

    // A failed HTTP request must release the form for correction/retry and keep it dirty.
    await page.route('**/admin/manual/**', (route) => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
    await page.getByTestId('manual-meta-save').click();
    await expect(page.getByTestId('manual-meta-form').getByRole('alert')).toContainText(
      locale === 'cs' ? 'Služba je dočasně nedostupná.' : 'The service is temporarily unavailable.',
    );
    await expect(page.locator('#manual-credits')).toBeEnabled();
    await expect(page.locator('#manual-credits')).toHaveValue(credits);
    await expect(page.getByTestId('manual-meta-save')).toBeEnabled();
    expect(await storedMeta()).toMatchObject({ credits: '', source_url: null });
    await page.unroute('**/admin/manual/**');
    await manualLink.click();
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-unsaved-action="stay"]').click();

    // The real server action rejects a non-HTTPS source; the guard must keep the editor.
    await page.locator('#manual-source-url').fill('http://example.org/manual');
    await manualLink.click();
    await dialog.locator('[data-unsaved-action="save"]').click();
    await expect(dialog.locator('[data-unsaved-error]')).toBeVisible();
    await expect(page).toHaveURL(editorUrl);
    expect(await storedMeta()).toMatchObject({ credits: '', source_url: null });
    await dialog.locator('[data-unsaved-action="stay"]').click();
    await page.locator('#manual-source-url').fill('https://example.org/manual');

    await manualLink.click();
    await dialog.locator('[data-unsaved-action="save"]').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/manual$`));
    expect(await storedMeta()).toMatchObject({ credits, source_url: 'https://example.org/manual' });

    // A successful explicit save leaves no stale dirty entry, and discard never writes.
    await page.goto(editorUrl);
    await page.locator('#manual-credits').fill(`${credits} updated`);
    await page.getByTestId('manual-meta-save').click();
    await expect(page.getByTestId('manual-meta-form')).toContainText(locale === 'cs' ? 'Údaje článku jsou uložené.' : 'Article details are saved.');
    await manualLink.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/manual$`));
    await expect(dialog).toHaveCount(0);
    await page.goto(editorUrl);
    await page.locator('#manual-credits').fill('Unsaved text to discard');
    await manualLink.click();
    await dialog.locator('[data-unsaved-action="discard"]').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/manual$`));
    expect(await storedMeta()).toMatchObject({ credits: `${credits} updated`, source_url: 'https://example.org/manual' });
  });
}
