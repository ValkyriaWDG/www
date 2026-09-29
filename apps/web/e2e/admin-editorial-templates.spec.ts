import { expect, test } from '@playwright/test';
import { createPost, expectSaved, fillPublishable, publish, uniqueSuffix } from './admin-editorial-helpers';
import { signInAs } from './support/auth';

/**
 * Editorial template backgrounds (owner graphics pack 2026-09-29): an authorized editor
 * adds a shipped text-free scene to the editorial media library, edits its defaults in
 * the normal detail panel and uses it as a cover. It stays private until published
 * content references it. Match managers and game-scoped editors never get the panel.
 */

test('an editor adds a template background, edits it and publishes it as a cover', async ({ context, page, request }) => {
  await signInAs(context, { roles: ['editor'], name: 'Synthetická redaktorka' });
  const suffix = uniqueSuffix();
  await page.goto('/cs/admin/media');
  const panel = page.getByTestId('editorial-templates');
  await expect(panel.locator('summary')).toHaveText('Šablony pozadí Valkyria (8)');
  await expect(page.getByRole('button', { name: 'Nahrát obrázek' }).locator('svg[data-icon="upload"]')).toHaveAttribute('aria-hidden', 'true');
  await panel.locator('summary').click();
  await expect(panel.locator('[data-editorial-template]')).toHaveCount(8);
  const previews = panel.locator('[data-editorial-template] img');
  await expect(previews.first()).toHaveAttribute('src', '/images/editorial/hll-infantry-480x270.webp');
  for (const image of await previews.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth)).toBe(480);
  }

  const card = panel.locator('[data-editorial-template="wdg-operator"]');
  await expect(card).toContainText('Wardogs');
  await expect(card).toContainText('Ilustrace: vousatý operátor');
  // The shared e2e database may already hold this template from an earlier run.
  if (await card.locator('[data-template-add]').count()) await card.locator('[data-template-add]').click();
  else await card.locator('[data-template-asset]').click();
  await expect(page).toHaveURL(/\/cs\/admin\/media\?asset=[0-9a-f-]{36}$/);
  const assetId = new URL(page.url()).searchParams.get('asset')!;
  const detail = page.getByTestId('media-detail');
  await expect(detail.getByTestId('media-detail-filename')).toHaveText('valkyria-wdg-operator.webp');
  await expect(detail.getByLabel('Výchozí alternativní text (angličtina)')).toHaveValue(/^Illustration: bearded operator/);
  await expect(detail.getByLabel('Původ')).toHaveValue(/02-predchozi-bannery\/assets\/wdg-operator\.webp/);
  // An unreferenced library image is private.
  expect((await request.get(`/api/media/${assetId}/thumb`)).status()).toBe(404);

  // Adding the same template again reuses the asset instead of duplicating it.
  await page.getByTestId('editorial-templates').locator('summary').click();
  await expect(page.locator('[data-editorial-template="wdg-operator"] [data-template-asset]')).toHaveAttribute('data-template-asset', assetId);

  // Library defaults stay editable in the normal flow.
  const alt = `Ilustrace: operátor u strážní věže ${suffix}`;
  await detail.getByLabel('Výchozí alternativní text (čeština)').fill(alt);
  await detail.getByTestId('media-save').click();
  await expect(detail).toContainText('Podrobnosti obrázku jsou uloženy');

  // Cover of a draft post through the ordinary picker.
  await createPost(page, `[E2E] Šablona ${suffix}`);
  // Save/preview carry decorative pack glyphs; their accessible names are unchanged.
  await expect(page.getByTestId('editor-save').locator('svg[data-icon="save"]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('editor-preview').locator('svg[data-icon="preview"]')).toHaveAttribute('aria-hidden', 'true');
  await page.getByTestId('cover-choose').click();
  const picker = page.getByTestId('media-picker');
  await picker.getByRole('searchbox').fill(suffix);
  await picker.getByRole('searchbox').press('Enter');
  await picker.locator(`[data-asset-id="${assetId}"]`).click();
  await expect(picker.getByLabel(/^Alternativní text \(Čeština\)/)).toHaveValue(alt);
  await picker.getByTestId('media-picker-confirm').click();
  await expect(page.getByTestId('cover-thumb')).toHaveAttribute('src', new RegExp(`/api/media/${assetId}/`));
  await fillPublishable(page, 'Text článku se šablonou pozadí.', 'Perex článku se šablonou.');
  await expectSaved(page);
  expect((await request.get(`/api/media/${assetId}/thumb`)).status()).toBe(404);

  await publish(page);
  expect((await request.get(`/api/media/${assetId}/thumb`)).status()).toBe(200);
});

test('match managers and game-scoped editors do not get the template library', async ({ browser }) => {
  const matchManager = await browser.newContext();
  await signInAs(matchManager, { roles: ['match_manager'] });
  const mmPage = await matchManager.newPage();
  await mmPage.goto('/en/admin/media');
  await expect(mmPage.getByTestId('admin-media')).toHaveAttribute('data-scopes', 'match');
  await expect(mmPage.getByTestId('editorial-templates')).toHaveCount(0);
  await matchManager.close();

  const scoped = await browser.newContext();
  await signInAs(scoped, { roles: ['hll_editor'], name: 'Synthetic HLL editor' });
  const scopedPage = await scoped.newPage();
  await scopedPage.goto('/cs/admin/media');
  await expect(scopedPage.getByTestId('access-denied')).toBeVisible();
  await expect(scopedPage.getByTestId('editorial-templates')).toHaveCount(0);
  await scoped.close();
});
