import { expect, type Page, test } from '@playwright/test';
import pg from 'pg';
import { signInAs } from './support/auth';
import { e2eDatabaseUrl } from './support/database-url';

/**
 * One website session across both games with game-scoped authority: a Hell Let Loose
 * editor sees and creates only HLL editorial content and gets an explicit denial for a
 * Wardogs post, while a platform-wide editor keeps every scope. Synthetic fixtures only.
 */

/** Trimmed cell texts of the column whose header is `header` in the admin list table. */
async function columnTexts(page: Page, header: string): Promise<string[]> {
  return page.locator('table').first().evaluate((table, name) => {
    const headers = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim());
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`No column ${name}`);
    return [...table.querySelectorAll('tbody tr')].map((row) => row.children[index]?.textContent?.trim() ?? '');
  }, header);
}

async function fixtureDocumentId(game: 'wardogs' | 'hell-let-loose', kind: 'news' | 'manual'): Promise<string> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      `select id from content_document where kind = $1 and game = $2 and is_fixture and archived_at is null order by created_at limit 1`,
      [kind, game],
    );
    if (!result.rows[0]) throw new Error(`No ${game} ${kind} fixture`);
    return result.rows[0].id;
  } finally {
    await client.end();
  }
}

test('an HLL-scoped editor sees only HLL posts and is denied a Wardogs post', async ({ context, page }) => {
  await signInAs(context, { roles: ['hll_editor'], name: 'Synthetic HLL editor' });
  await page.goto('/cs/admin/news');
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  const scopes = await columnTexts(page, 'Rozsah');
  expect(scopes.length).toBeGreaterThan(0);
  expect(new Set(scopes)).toEqual(new Set(['Hell Let Loose']));

  // A filter or a direct URL cannot widen the scope.
  const wardogs = await fixtureDocumentId('wardogs', 'news');
  await page.goto(`/cs/admin/news/${wardogs}`);
  await expect(page.getByTestId('access-denied')).toBeVisible();
  await expect(page.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
  await expect(page.getByTestId('editor-title')).toHaveCount(0);
  await page.goto(`/cs/admin/news/${wardogs}/preview`);
  await expect(page.getByTestId('access-denied')).toBeVisible();

  // Creation offers only the scoped game.
  await page.goto('/cs/admin/news/new');
  const scope = page.getByTestId('new-post-scope');
  await expect(scope.locator('option')).toHaveText(['Hell Let Loose']);

  // The same session opens an HLL post and the HLL field manual.
  const hll = await fixtureDocumentId('hell-let-loose', 'news');
  await page.goto(`/cs/admin/news/${hll}`);
  await expect(page.getByTestId('editor-title')).toBeVisible();
  await page.goto('/cs/admin/manual');
  await expect(page.getByRole('heading', { level: 1, name: 'Příručka' })).toBeVisible();
});

test('a platform-wide editor sees every scope and can choose community, Wardogs or HLL', async ({ context, page }) => {
  await signInAs(context, { roles: ['editor'], name: 'Synthetic platform editor' });
  // Other admin specs publish posts into the shared database; newest rows come first, so
  // collect the scope column across pages instead of relying on page 1.
  const scopes = new Set<string>();
  for (let listPage = 1; listPage <= 10 && scopes.size < 3; listPage++) {
    await page.goto(`/cs/admin/news?locale=cs&page=${listPage}`);
    if ((await page.locator('table').count()) === 0) break;
    const texts = await columnTexts(page, 'Rozsah');
    if (texts.length === 0) break;
    for (const text of texts) scopes.add(text);
  }
  for (const label of ['Wardogs', 'Hell Let Loose', 'Komunita']) expect(scopes).toContain(label);
  await page.goto('/cs/admin/news/new');
  await expect(page.getByTestId('new-post-scope').locator('option')).toHaveText(['Komunita', 'Wardogs', 'Hell Let Loose']);
  // Field manual articles always belong to one game.
  await page.goto('/cs/admin/manual/new');
  await expect(page.getByTestId('new-post-scope').locator('option')).toHaveText(['Hell Let Loose']);
});
