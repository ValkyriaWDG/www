import { expect, test } from '@playwright/test';
import { auditCount, e2eDb } from './admin-community-support';
import { signInAs } from './support/auth';

/**
 * Integration health (read-only, issue #22) and the website server presentation for
 * administrators. The e2e server runs labelled synthetic HLL/Wardogs fixtures without
 * any Logi configuration, so the page must show honest "not configured" states and no
 * synthesized success. The override this file saves is removed again at the end so the
 * shared public fixtures stay as seeded for the other specs. (A killed local run with
 * `reuseExistingServer` can leave the row behind; `beforeAll` clears it. CI starts fresh.)
 */

const KEY = 'servers.presentation';

async function storedPresentation() {
  const result = await e2eDb().query<{ value: unknown; version: number }>('select value, version from site_setting where key = $1', [KEY]);
  return result.rows[0] ?? null;
}

async function clearPresentation() {
  await e2eDb().query('delete from site_setting where key = $1', [KEY]);
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(clearPresentation);
test.afterAll(clearPresentation);

test('administrator sees website collector health in Czech and English without configuration internals', async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, { roles: ['administrator'], name: 'Syntetický administrátor integrací' });
  const page = await context.newPage();
  await page.goto('/cs/admin');
  await expect(page.getByTestId('admin-module-integrations')).toBeVisible();
  await page.getByTestId('admin-nav').locator('[data-admin-nav="integrations"]').click();
  await expect(page).toHaveURL(/\/cs\/admin\/integrations$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Integrace a servery' })).toBeVisible();
  await expect(page.getByText('Co tato stránka ukazuje')).toBeVisible();

  // Game servers: labelled synthetic fixtures for both games with their current public state.
  const hll = page.locator('[data-game-servers="hll"]');
  await expect(hll).toHaveAttribute('data-server-source', 'synthetic-fixture');
  await expect(hll).toContainText('Syntetická data');
  await expect(hll.locator('[data-server-row]')).toHaveCount(3);
  await expect(hll.locator('[data-server-row="hll/synthetic-alpha"]')).toContainText('Aktuální');
  await expect(hll.locator('[data-server-row="hll/synthetic-charlie"]')).toContainText('Bez údajů');
  const wardogs = page.locator('[data-game-servers="wardogs"]');
  await expect(wardogs.locator('[data-server-row="wardogs/synthetic-wardogs"]')).toContainText('Aktuální');

  // Logi: nothing is configured; nothing is reported healthy.
  const logi = page.locator('[data-integrations-logi]');
  await expect(logi.getByText('Žádný zdroj Logi není nastaven.')).toBeVisible();
  await expect(logi).toContainText('Přihlášení přes Logi (SSO)');
  await expect(logi).toContainText('Vypnuto');
  await expect(logi.locator('[data-state="healthy"]')).toHaveCount(0);
  await expect(logi).toContainText('zatím žádné doručení');
  // Wardogs readers: the e2e server runs the labelled synthetic reader source, so both are "configured" without any key.
  const readers = logi.locator('[data-logi-readers]');
  await expect(logi).toContainText('Čtečky Wardogs (League, Warcon)');
  await expect(readers.locator('[data-reader="league-matches"]')).toHaveAttribute('data-state', 'configured');
  await expect(readers.locator('[data-reader="warcon-data"]')).toHaveAttribute('data-state', 'configured');
  await expect(readers.locator('[data-reader="league-matches"]')).toContainText('Wardogs League');
  await expect(readers.locator('[data-reader="warcon-data"]')).toContainText(/Warcon.*Nastaveno/s);
  // The synthetic source is reported as a code and rendered in the interface language.
  await expect(readers).toContainText('syntetický zdroj – jen testy a kontrolní snímky');
  await expect(readers).not.toContainText('synthetic-fixture');

  // Discord: the e2e role mapping has six entries.
  await expect(page.locator('[data-integrations-discord]')).toContainText('6 mapovaných rolí');

  // No source URL, key or loopback host of the configuration reaches the page.
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/127\.0\.0\.1|https?:\/\/|statsApiKey|baseUrl|e2e-synthetic/i);

  // Refresh is a plain reload of the page; the page never polls the server routes on its own.
  await expect(page.locator('[data-integrations-refresh]')).toHaveAttribute('href', '/cs/admin/integrations');
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/servers/')) requests += 1;
  });
  await page.waitForTimeout(2_000);
  expect(requests).toBe(0);
  await page.locator('[data-integrations-refresh]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Integrace a servery' })).toBeVisible();

  await page.goto('/en/admin/integrations');
  await expect(page.getByRole('heading', { level: 1, name: 'Integrations and servers' })).toBeVisible();
  await expect(page.locator('[data-integrations-logi]').getByText('No Logi source is configured.')).toBeVisible();
  await expect(page.locator('[data-integrations-logi]')).toContainText('Wardogs readers (League, Warcon)');
  await expect(page.locator('[data-logi-readers] [data-reader="league-matches"]')).toContainText(/Wardogs League.*Configured/s);
  await expect(page.locator('[data-game-servers="hll"]')).toContainText('Synthetic data');
  await expect(page.locator('[data-integrations-discord]')).toContainText('6 mapped roles');
  await context.close();
});

test('editors and match managers are denied on the direct URL in both languages', async ({ browser }) => {
  for (const role of ['editor', 'match_manager'] as const) {
    const context = await browser.newContext();
    await signInAs(context, { roles: [role] });
    const page = await context.newPage();
    for (const path of ['/cs/admin/integrations', '/en/admin/integrations']) {
      await page.goto(path);
      await expect(page.getByTestId('access-denied')).toBeVisible();
      await expect(page.locator('[data-admin-integrations], [data-server-presentation-form]')).toHaveCount(0);
    }
    await page.goto('/cs/admin');
    await expect(page.getByTestId('admin-module-integrations')).toHaveCount(0);
    await expect(page.getByTestId('admin-nav').locator('[data-admin-nav="integrations"]')).toHaveCount(0);
    await context.close();
  }
});

test('presentation overrides rename a Wardogs server and hide an HLL server publicly, survive a failed save and can be removed', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  await signInAs(context, { roles: ['administrator'], name: 'Syntetický administrátor serverů' });
  const page = await context.newPage();
  await page.goto('/cs/admin/integrations');
  const wardogsRow = page.locator('[data-server-row="wardogs/synthetic-wardogs"]');
  const charlieRow = page.locator('[data-server-row="hll/synthetic-charlie"]');
  const save = page.locator('[data-action="save-server-presentation"]');

  // Client validation reports a non-numeric order before anything is sent.
  await wardogsRow.getByLabel(/^Pořadí/).fill('abc');
  await save.click();
  await expect(wardogsRow.getByText('Zadejte celé číslo', { exact: false })).toBeVisible();
  expect(await storedPresentation()).toBeNull();

  await wardogsRow.getByLabel(/^Pořadí/).fill('');
  await wardogsRow.getByLabel(/^Název na webu/).fill('[E2E] Přejmenovaný Wardogs server');
  await charlieRow.getByLabel('Zobrazit na webu').uncheck();
  await expect(charlieRow).toHaveAttribute('data-hidden', '');
  await expect(page.getByRole('status').filter({ hasText: 'neuloženo' })).toBeVisible();
  await save.click();
  await expect(page.getByText('Zobrazení serverů uloženo')).toBeVisible();
  const stored = await storedPresentation();
  expect(stored?.version).toBe(1);
  expect(stored?.value).toEqual([
    { game: 'hll', publicId: 'synthetic-charlie', published: false },
    { game: 'wardogs', publicId: 'synthetic-wardogs', name: '[E2E] Přejmenovaný Wardogs server' },
  ]);
  expect(await auditCount({ action: 'settings.update', outcome: 'success', entityId: KEY })).toBeGreaterThanOrEqual(1);

  // Public pages and the polling route reflect the presentation immediately.
  const visitor = await browser.newPage();
  await visitor.goto('/cs/wardogs');
  const banner = visitor.locator('[data-home-servers]');
  await expect(banner).toHaveAttribute('aria-busy', 'false');
  await expect(banner).toContainText('[E2E] Přejmenovaný Wardogs server');
  await expect(banner).toContainText('0 / 98');
  await visitor.goto('/cs/hll/servers');
  await expect(visitor.locator('[data-server-table]')).toBeVisible();
  await expect(visitor.locator('[data-server-name]')).toHaveCount(2);
  await expect(visitor.locator('main')).not.toContainText('Test Server Charlie');
  await visitor.goto('/cs/hll/servers?server=synthetic-charlie');
  await expect(visitor.locator('[data-server-detail="missing"]')).toBeVisible();
  const api = await visitor.request.get('/api/servers/hll?server=synthetic-charlie');
  expect(api.status()).toBe(200);
  expect(api.headers()['cache-control']).toContain('no-store');
  const body = await api.json();
  expect(body.overview.servers.map((server: { publicId: string }) => server.publicId)).toEqual(['synthetic-alpha', 'synthetic-bravo']);
  expect(body.livePlayers).toBeNull();
  await visitor.close();

  // A failed save (aborted server action) keeps the entered values and says so.
  await page.route('**/cs/admin/integrations', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await wardogsRow.getByLabel(/^Název na webu/).fill('[E2E] Neuložený název');
  await save.click();
  // The unsaved-changes guard announces its own alert; read the form's notice.
  await expect(page.locator('[data-server-presentation-form]').getByRole('alert')).toContainText('Došlo k neočekávané chybě');
  await expect(wardogsRow.getByLabel(/^Název na webu/)).toHaveValue('[E2E] Neuložený název');
  expect((await storedPresentation())?.version).toBe(1);
  await page.unroute('**/cs/admin/integrations');

  // Clearing every override removes the stored setting and restores the configured presentation.
  await wardogsRow.getByLabel(/^Název na webu/).fill('');
  await charlieRow.getByLabel('Zobrazit na webu').check();
  await save.click();
  await expect(page.getByText('Zobrazení serverů uloženo')).toBeVisible();
  await expect.poll(storedPresentation).toBeNull();
  const restored = await browser.newPage();
  await restored.goto('/cs/hll/servers');
  await expect(restored.locator('[data-server-name]')).toHaveCount(3);
  await restored.goto('/cs/wardogs');
  await expect(restored.locator('[data-home-servers]')).not.toContainText('[E2E]');
  await restored.close();
  await context.close();
});
