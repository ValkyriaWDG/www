import { expect, test } from '@playwright/test';
import { auditCount, e2eDb, uniqueSuffix } from './admin-community-support';
import { signInAs } from './support/auth';

/**
 * Site settings (administrators/owners only) and the audit screen's access boundary.
 * The test restores the Discord override it creates so the shared home page stays as seeded.
 */

async function storedSetting(key: string) {
  const result = await e2eDb().query<{ value: unknown; version: number }>('select value, version from site_setting where key = $1', [key]);
  return result.rows[0] ?? null;
}

test('administrator saves a Discord invite override that the home CTA uses immediately', async ({ browser }) => {
  test.setTimeout(120_000);
  const invite = `https://discord.gg/valkyria-e2e-${uniqueSuffix()}`;
  const context = await browser.newContext();
  await signInAs(context, { roles: ['administrator'], name: 'Syntetický administrátor nastavení' });
  const page = await context.newPage();
  await page.goto('/cs/admin/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Nastavení webu' })).toBeVisible();
  await expect(page.getByText('Uložením se nastavení ihned projeví na veřejném webu.', { exact: false })).toBeVisible();
  // Only allowlisted settings are exposed; internal system.* keys never appear.
  expect(await page.locator('main').innerText()).not.toMatch(/system\./);

  const field = page.getByLabel(/^Odkaz na pozvánku Discord/);
  await field.fill('https://example.org/not-discord');
  await expect(page.locator('[data-live="discord"]')).toHaveAttribute('data-changed', 'true');
  await page.locator('[data-action="save-settings"]').click();
  await expect(page.getByText('Zadejte pozvánku na Discord', { exact: false })).toBeVisible();
  expect(await storedSetting('community.discordInviteUrl')).toBeNull();

  await field.fill(invite);
  await page.locator('[data-action="save-settings"]').click();
  await expect(page.getByText('Nastavení uloženo')).toBeVisible();
  await expect(page.locator('[data-live="discord"]')).toContainText(invite);
  expect((await storedSetting('community.discordInviteUrl'))?.value).toBe(invite);
  expect(await auditCount({ action: 'settings.update', outcome: 'success', entityId: 'community.discordInviteUrl' })).toBeGreaterThanOrEqual(1);

  // One shared community setting: the Wardogs CTA, the HLL landing and the hub all use it.
  const home = await browser.newPage();
  await home.goto('/cs/wardogs');
  await expect(home.locator('[data-cta="discord"]')).toHaveAttribute('href', invite);
  await home.goto('/cs/hll');
  await expect(home.locator('[data-hll-discord]')).toHaveAttribute('href', invite);
  await home.goto('/cs');
  await expect(home.locator('[data-hub-shared="discord"]')).toHaveAttribute('href', invite);

  // Restore the operator default (an empty field removes the override deliberately).
  await field.fill('');
  await page.locator('[data-action="save-settings"]').click();
  await expect(page.locator('[data-live="discord"]')).not.toContainText(invite);
  await expect.poll(() => storedSetting('community.discordInviteUrl')).toBeNull();
  await home.goto('/cs/wardogs');
  await expect(home.locator('[data-cta="discord"]')).not.toHaveAttribute('href', invite);
  await home.close();
  await context.close();
});

test('background media from a non-allowlisted origin is rejected and never previewed', async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, { roles: ['administrator'] });
  const page = await context.newPage();
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://evil.example')) remoteRequests.push(request.url());
  });
  await page.goto('/en/admin/settings');
  await page.getByLabel('Custom override').check();
  await page.getByLabel(/^Poster image URL/).fill('https://evil.example/poster.jpg');
  await page.getByLabel(/^Provenance and rights/).fill('Synthetic test value');
  await expect(page.getByText('This address is not allowed.', { exact: false })).toHaveCount(0);
  await page.locator('[data-action="save-settings"]').click();
  await expect(page.getByText('This address is not allowed. Use a same-site path (/…) or an allowlisted https origin.')).toBeVisible();
  await expect(page.locator('[data-preview-status="invalid"]')).toBeVisible();
  expect(await storedSetting('background.media')).toBeNull();
  expect(remoteRequests).toEqual([]);

  // Missing provenance is a validation error too; a same-site poster previews locally.
  await page.getByLabel(/^Poster image URL/).fill('/brand/valkyria-emblem-733.webp');
  await page.getByLabel(/^Provenance and rights/).fill('');
  await expect(page.locator('[data-preview-status="invalid"]')).toBeVisible();
  await page.getByLabel(/^Provenance and rights/).fill('Synthetic test value');
  await expect(page.locator('[data-preview-status="ready"]')).toBeVisible();
  // A same-site path that does not exist is reported as a preview failure, not a validation error.
  await page.getByLabel(/^Poster image URL/).fill('/e2e-missing/poster.webp');
  await expect(page.locator('[data-preview-status="failed"]')).toBeVisible();
  expect(await storedSetting('background.media')).toBeNull();
  await context.close();
});

test('settings and audit are denied to match managers and editors', async ({ browser }) => {
  for (const role of ['match_manager', 'editor'] as const) {
    const context = await browser.newContext();
    await signInAs(context, { roles: [role] });
    const page = await context.newPage();
    for (const path of ['/cs/admin/settings', '/en/admin/audit']) {
      await page.goto(path);
      await expect(page.getByTestId('access-denied')).toBeVisible();
      await expect(page.locator('[data-settings-form], [data-admin-audit]')).toHaveCount(0);
    }
    await context.close();
  }
});
