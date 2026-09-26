import { expect, test } from '@playwright/test';
import { FIXTURE_ASSET_IDS } from '../src/fixtures/data';
import { syntheticPng, uniqueSuffix } from './admin-editorial-helpers';
import { signInAs } from './support/auth';

/**
 * Media library: upload with explicit states, hostile files rejected with localized
 * errors, library defaults editable, referenced assets protected from deletion and
 * per-scope visibility (editors: editorial, match managers: match).
 */

test('uploads show progress states; SVG and fake PNG files are rejected with a localized error', async ({ context, page, request }) => {
  await signInAs(context, { roles: ['editor'] });
  const suffix = uniqueSuffix();
  await page.goto('/cs/admin/media');
  await expect(page.getByRole('heading', { level: 1, name: 'Knihovna médií' })).toBeVisible();
  await expect(page.getByTestId('admin-media')).toHaveAttribute('data-scopes', 'editorial');
  await expect(page.getByTestId('media-upload-button')).toHaveText('NAHRÁT OBRÁZEK');
  const input = page.getByTestId('media-upload-input');

  await input.setInputFiles({
    name: `evil-${suffix}.svg`,
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  const svgItem = page.getByTestId('upload-item').filter({ hasText: `evil-${suffix}.svg` });
  await expect(svgItem).toHaveAttribute('data-state', 'failed');
  await expect(svgItem.locator('[data-upload-error]')).toHaveAttribute('data-upload-error', 'unsupported_media');
  await expect(svgItem).toContainText('Nepodporovaný nebo poškozený soubor');

  await input.setInputFiles({ name: `fake-${suffix}.png`, mimeType: 'image/png', buffer: Buffer.from('this is not really a PNG image') });
  const fakeItem = page.getByTestId('upload-item').filter({ hasText: `fake-${suffix}.png` });
  await expect(fakeItem).toHaveAttribute('data-state', 'failed');
  await expect(fakeItem.locator('[data-upload-error]')).toHaveAttribute('data-upload-error', 'unsupported_media');

  const name = `library-${suffix}.png`;
  await input.setInputFiles({ name, mimeType: 'image/png', buffer: await syntheticPng(1200, 675, '#3f5b2d') });
  const okItem = page.getByTestId('upload-item').filter({ hasText: name });
  await expect(okItem).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
  const card = page.getByTestId('media-card').filter({ hasText: name });
  await expect(card).toBeVisible();
  await expect(card).toContainText('1 200 × 675 px');
  await expect(card).toContainText('Nepoužívá se');
  const assetId = await card.getAttribute('data-asset-id');
  // Unreferenced uploads are private.
  expect((await request.get(`/api/media/${assetId}/thumb`)).status()).toBe(404);
  expect((await page.request.get(`/api/media/${assetId}/thumb`)).status()).toBe(200);

  // Detail panel: edit library defaults, then delete the unused image.
  await card.click();
  const detail = page.getByTestId('media-detail');
  await expect(detail.getByTestId('media-detail-filename')).toHaveText(name);
  await detail.getByLabel('Výchozí alternativní text (čeština)').fill('Zelený syntetický obrázek');
  await detail.getByLabel('Výchozí alternativní text (angličtina)').fill('Green synthetic image');
  await detail.getByLabel('Původ').fill('Vygenerováno testem');
  await detail.getByTestId('media-save').click();
  await expect(detail).toContainText('Podrobnosti obrázku jsou uloženy');
  await page.reload();
  await expect(page.getByTestId('media-detail').getByLabel('Výchozí alternativní text (angličtina)')).toHaveValue('Green synthetic image');
  // Search finds it by the new default text.
  await page.goto(`/cs/admin/media?q=${encodeURIComponent('Zelený syntetický')}`);
  await expect(page.getByTestId('media-card')).toHaveCount(1);

  await page.getByTestId('media-card').click();
  await page.getByTestId('media-delete').click();
  await page.locator('[data-confirm="confirm"]').click();
  await expect(page.getByTestId('media-detail')).toHaveCount(0);
  await expect(page.getByTestId('media-card').filter({ hasText: name })).toHaveCount(0);
});

test('a referenced image cannot be deleted and scopes stay separated', async ({ browser, context, page }) => {
  await signInAs(context, { roles: ['editor'] });
  // The synthetic fixture news cover is used by published fixture articles.
  await page.goto(`/cs/admin/media?asset=${FIXTURE_ASSET_IDS.newsCover}`);
  const detail = page.getByTestId('media-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('media-references')).toContainText('Novinka nebo stránka');
  await detail.getByTestId('media-delete').click();
  await expect(page.getByRole('alertdialog')).toContainText('nelze ho smazat');
  await page.locator('[data-confirm="confirm"]').click();
  await expect(detail).toContainText('Obrázek stále používá článek, stránka, člen nebo zápas, proto nebyl smazán.');
  await page.reload();
  await expect(page.getByTestId('media-detail')).toBeVisible();

  // Editors do not see match-scope assets; match managers see only those.
  await page.goto(`/cs/admin/media?asset=${FIXTURE_ASSET_IDS.matchCover}`);
  await expect(page.getByTestId('media-detail')).toHaveCount(0);
  const matchManager = await browser.newContext();
  await signInAs(matchManager, { roles: ['match_manager'] });
  const mmPage = await matchManager.newPage();
  await mmPage.goto('/en/admin/media');
  await expect(mmPage.getByRole('heading', { level: 1, name: 'Media library' })).toBeVisible();
  await expect(mmPage.getByTestId('admin-media')).toHaveAttribute('data-scopes', 'match');
  const ids = await mmPage.getByTestId('media-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-asset-id')));
  expect(ids).toContain(FIXTURE_ASSET_IDS.matchCover);
  expect(ids).not.toContain(FIXTURE_ASSET_IDS.newsCover);
  await mmPage.goto(`/en/admin/media?asset=${FIXTURE_ASSET_IDS.newsCover}`);
  await expect(mmPage.getByTestId('media-detail')).toHaveCount(0);
  await matchManager.close();
});
