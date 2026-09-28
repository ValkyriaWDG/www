import { type APIRequestContext, expect, test } from '@playwright/test';
import { auditCount, memberBySlug, uniqueSuffix } from './admin-community-support';
import { E2E_BASE_URL, signInAs } from './support/auth';

/**
 * Member publication editor: exact display names, consent before publication, publish
 * and hide. The public profile route belongs to the public-pages slice; when it is not
 * part of this build the visibility check is annotated and verified via the sitemap.
 */

async function sitemapHas(request: APIRequestContext, path: string): Promise<boolean> {
  const xml = await (await request.get('/sitemap.xml')).text();
  return xml.includes(`${E2E_BASE_URL}${path}<`) || xml.includes(`${E2E_BASE_URL}${path}"`);
}

test('editor creates a profile, is refused without consent, records consent, publishes and hides it', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const suffix = uniqueSuffix();
  const displayName = `Žluťoučký kůň Ďábel 🐎 ${suffix}`;
  const context = await browser.newContext();
  await signInAs(context, { roles: ['editor'], name: 'Syntetický editor profilů' });
  const page = await context.newPage();

  await page.goto('/cs/admin/members');
  await expect(page.getByRole('heading', { level: 1, name: 'Profily členů' })).toBeVisible();
  await page.getByRole('link', { name: 'Nový profil' }).click();
  await page.getByLabel(/^Zobrazované jméno/).fill(`  ${displayName}  `);
  await page.getByRole('checkbox', { name: 'Wardogs' }).check();
  await page.getByLabel('Nováček').check();
  await page.locator('[data-action="save"]').click();
  await expect(page).toHaveURL(/\/cs\/admin\/members\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(displayName);
  await expect(page.locator('[data-preview-name]')).toHaveText(displayName);
  // No Discord identifiers, e-mail or guild roles are ever shown in the editor.
  expect(await page.locator('main').innerText()).not.toMatch(/@accounts\.invalid|\b\d{17,20}\b/);

  const slug = (await page.locator('input[name="slug"]').inputValue()).trim();
  expect(slug).toMatch(/^zlutoucky-kun-dabel/);
  const stored = (await memberBySlug(slug))!;
  expect(stored.display_name).toBe(displayName);
  expect(stored.state).toBe('draft');

  // Publication without consent is refused by the server.
  await page.locator('[data-action="publish"]').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Zveřejnění bylo odmítnuto: souhlas člena zatím není zaznamenán.' })).toBeVisible();
  expect((await memberBySlug(slug))!.state).toBe('draft');

  // Explicit consent confirmation (checkbox + audited action).
  const consentButton = page.locator('[data-action="confirm-consent"]');
  await expect(consentButton).toBeDisabled();
  await page.locator('[data-consent-form] input[type="checkbox"]').check();
  await consentButton.click();
  await expect(page.locator('[data-member-consent="yes"]')).toBeVisible();
  expect((await memberBySlug(slug))!.consent_confirmed_at).not.toBeNull();
  expect(await auditCount({ action: 'member.consent.confirm', outcome: 'success', entityId: stored.id })).toBe(1);

  await page.locator('[data-action="publish"]').click();
  await expect(page.locator('[data-member-state="published"]')).toBeVisible();
  const publicPath = `/cs/members/${slug}`;
  await expect(page.locator('[data-publication-panel] [data-public-link]')).toHaveAttribute('href', publicPath);
  expect(await sitemapHas(request, publicPath)).toBe(true);
  const profileRoute = await request.get(publicPath);
  if (profileRoute.status() !== 404) {
    const visitor = await browser.newPage();
    await visitor.goto(publicPath);
    await expect(visitor.getByText(displayName).first()).toBeVisible();
    await visitor.close();
  } else test.info().annotations.push({ type: 'public-page-check-skipped', description: `${publicPath} is not part of this build; publication verified via sitemap and database.` });

  // Hide → no longer public (404) and removed from the sitemap.
  await page.locator('[data-action="hide"]').click();
  const dialog = page.getByRole('alertdialog', { name: 'Skrýt tento profil?' });
  await dialog.locator('[data-confirm="confirm"]').click();
  await expect(page.locator('[data-member-state="hidden"]')).toBeVisible();
  expect((await request.get(publicPath)).status()).toBe(404);
  expect(await sitemapHas(request, publicPath)).toBe(false);
  await context.close();
});

test('match managers cannot open or change member profiles', async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, { roles: ['match_manager'] });
  const page = await context.newPage();
  await page.goto('/cs/admin/members');
  await expect(page.getByTestId('access-denied')).toBeVisible();
  await expect(page.getByText('Syntetický hráč Alfa')).toHaveCount(0);
  const member = (await memberBySlug('synteticky-hrac-charlie'))!;
  await page.goto(`/en/admin/members/${member.id}`);
  await expect(page.getByTestId('access-denied')).toBeVisible();
  await context.close();
});
