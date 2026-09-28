import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test } from '@playwright/test';
import pg from 'pg';
import { type E2ERole, signInAs } from './support/auth';
import { e2eDatabaseUrl } from './support/database-url';

/**
 * Captioned administration screenshots for game scope and the field manual. Opt-in:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-admin-hll.spec.ts
 * Output: <repo>/.local/evidence/admin-hll/ (gitignored) + captures.json. Synthetic
 * fixtures and synthetic identities (local Discord mock) only.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture HLL administration screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/admin-hll');
const captures: { file: string; caption: string; viewport: string; uiLocale: string; role: string }[] = [];

async function documentId(kind: 'news' | 'manual', game: 'wardogs' | 'hell-let-loose', slug?: string): Promise<string> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      `select d.id from content_document d
         join content_translation t on t.document_id = d.id
        where d.kind = $1 and d.game = $2 and d.is_fixture and d.archived_at is null and ($3::text is null or t.draft_slug = $3)
        order by d.created_at limit 1`,
      [kind, game, slug ?? null],
    );
    if (!result.rows[0]) throw new Error(`No ${game} ${kind} fixture`);
    return result.rows[0].id;
  } finally {
    await client.end();
  }
}

async function open(browser: Browser, role: E2ERole, url: string, width = 1440, height = 900): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'cs-CZ', timezoneId: 'Europe/Prague' });
  await signInAs(context, { roles: [role], name: role === 'hll_editor' ? 'Synthetický HLL redaktor' : 'Synthetická redaktorka' });
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  return page;
}

async function shot(page: Page, file: string, caption: string, role: string, fullPage = false) {
  await page.screenshot({ path: path.join(outDir, file), animations: 'disabled', caret: 'hide', fullPage });
  const viewport = page.viewportSize();
  captures.push({ file, caption, viewport: `${viewport?.width}x${viewport?.height}${fullPage ? ' (full page)' : ''}`, uiLocale: 'cs', role });
  await page.context().close();
}

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

test('HLL-scoped editor: news list limited to Hell Let Loose', async ({ browser }) => {
  const page = await open(browser, 'hll_editor', '/cs/admin/news');
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  await shot(page, 'admin-news-hll-editor-cs-1440x900.png', 'Admin news list for a Discord role mapped to editor for Hell Let Loose only: every row and the Rozsah (scope) column show Hell Let Loose; Wardogs and community posts are absent.', 'editor scoped to hell-let-loose');
});

test('HLL-scoped editor: Wardogs post denied', async ({ browser }) => {
  const page = await open(browser, 'hll_editor', `/cs/admin/news/${await documentId('news', 'wardogs')}`);
  await expect(page.getByTestId('access-denied')).toBeVisible();
  await shot(page, 'admin-denied-wardogs-cs-1440x900.png', 'The same HLL-scoped session opening a Wardogs post by direct URL: localized access-denied panel (audited server-side), no content revealed.', 'editor scoped to hell-let-loose');
});

test('HLL-scoped editor: creation offers only HLL', async ({ browser }) => {
  const page = await open(browser, 'hll_editor', '/cs/admin/news/new');
  await expect(page.getByTestId('new-post-scope')).toBeVisible();
  await shot(page, 'admin-new-post-hll-editor-cs-1440x900.png', 'New post form for the HLL-scoped editor: the publication scope selector offers only Hell Let Loose.', 'editor scoped to hell-let-loose');
});

test('platform editor: all scopes in one list', async ({ browser }) => {
  const page = await open(browser, 'editor', '/cs/admin/news?locale=cs');
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  await shot(page, 'admin-news-platform-editor-cs-1440x900.png', 'Admin news list for a platform-wide editor: Wardogs, Hell Let Loose and community (Komunita) posts side by side with a visible scope column.', 'editor (platform-wide)');
});

test('field manual administration list', async ({ browser }) => {
  const page = await open(browser, 'editor', '/cs/admin/manual');
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  await shot(page, 'admin-manual-list-cs-1440x900.png', 'Field manual administration (Příručka): manual articles on the shared CMS with independent Czech/English states (published, private draft).', 'editor (platform-wide)');
});

test('field manual editor with source metadata', async ({ browser }) => {
  const page = await open(browser, 'editor', `/cs/admin/manual/${await documentId('manual', 'hell-let-loose', 'ukazka-prvni-nastaveni')}?lang=cs`);
  await expect(page.getByTestId('editor-title')).toBeVisible();
  await expect(page.getByTestId('manual-meta-save')).toBeVisible();
  await shot(page, 'admin-manual-editor-cs-1440x900.png', 'Field manual article editor (full page): the shared rich-text editor, HLL category, publication controls and the source/ordering form (original URL, date, language, credits, review).', 'editor (platform-wide)', true);
});
