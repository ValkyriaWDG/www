import { randomBytes } from 'node:crypto';
import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test';
import pg from 'pg';
import sharp from 'sharp';
import { e2eDatabaseUrl } from './support/database-url';

/**
 * Shared helpers for the editorial administration browser tests. Everything is
 * synthetic: generated images, "[E2E]" titles and unique slugs in the disposable
 * e2e database. Direct SQL is used only to ASSERT stored publication state.
 */

let pool: pg.Pool | undefined;
export function editorialDb(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: e2eDatabaseUrl(), max: 2, allowExitOnIdle: true });
  return pool;
}

export function uniqueSuffix(): string {
  return randomBytes(3).toString('hex');
}

/** Small synthetic PNG (solid colour + stripe) generated in the test; never a real screenshot. */
export async function syntheticPng(width = 640, height = 360, color = '#335577'): Promise<Buffer> {
  const stripe = await sharp({ create: { width, height: Math.max(8, Math.round(height / 6)), channels: 3, background: '#d9ad32' } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: color } })
    .composite([{ input: stripe, top: Math.round(height / 2), left: 0 }])
    .png()
    .toBuffer();
}

export type StoredTranslation = {
  id: string;
  version: number;
  draftSlug: string;
  liveSlug: string | null;
  draftTitle: string | null;
  publishedTitle: string | null;
  publishedRevisionId: string | null;
  draftRevisionId: string | null;
};

/** Stored draft/live pointers of one translation (assertions only). */
export async function storedTranslation(documentId: string, locale: 'cs' | 'en'): Promise<StoredTranslation | null> {
  const result = await editorialDb().query<StoredTranslation>(
    `select t.id, t.version, t.draft_slug as "draftSlug", t.live_slug as "liveSlug",
            d.title as "draftTitle", p.title as "publishedTitle",
            t.published_revision_id as "publishedRevisionId", t.draft_revision_id as "draftRevisionId"
       from content_translation t
       left join content_revision d on d.id = t.draft_revision_id
       left join content_revision p on p.id = t.published_revision_id
      where t.document_id = $1 and t.locale = $2`,
    [documentId, locale],
  );
  return result.rows[0] ?? null;
}

export async function activeScheduleCount(documentId: string): Promise<number> {
  const result = await editorialDb().query<{ count: string }>(
    `select count(*)::text as count from publication_schedule s join content_translation t on t.id = s.translation_id
      where t.document_id = $1 and s.state in ('pending', 'claimed', 'blocked', 'failed')`,
    [documentId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export function documentIdFromUrl(url: string): string {
  const match = /\/admin\/(?:news|content)\/([0-9a-f-]{36})/.exec(url);
  if (!match?.[1]) throw new Error(`No document id in ${url}`);
  return match[1];
}

let publicRoutes: boolean | undefined;

/**
 * The public news pages belong to another slice. When `/cs/news` exists (integrated
 * build) public assertions use the real article route; otherwise they use the same
 * published-only gate through `/sitemap.xml` and the stored live pointers.
 */
export async function publicNewsAvailable(request: APIRequestContext): Promise<boolean> {
  if (publicRoutes === undefined) publicRoutes = (await request.get('/cs/news', { maxRedirects: 0 })).status() === 200;
  return publicRoutes;
}

/**
 * Asserts what anonymous visitors see for a locale-specific news slug. Pass the test's
 * `request` fixture (it carries no browser session cookies).
 */
export async function expectPublicNews(
  client: APIRequestContext,
  locale: 'cs' | 'en',
  slug: string,
  expected: { title: string } | null,
): Promise<void> {
  if (await publicNewsAvailable(client)) {
    const response = await client.get(`/${locale}/news/${slug}`, { maxRedirects: 0 });
    if (expected) {
      expect(response.status(), `/${locale}/news/${slug}`).toBe(200);
      expect(await response.text()).toContain(expected.title);
    } else {
      expect([404, 307, 308]).toContain(response.status());
    }
  } else {
    test.info().annotations.push({ type: 'public-route', description: `/${locale}/news not built in this slice; asserted via sitemap + stored live pointer` });
    const sitemap = await (await client.get('/sitemap.xml')).text();
    if (expected) expect(sitemap).toContain(`/${locale}/news/${slug}<`);
    else expect(sitemap).not.toContain(`/${locale}/news/${slug}<`);
    const direct = await client.get(`/${locale}/news/${slug}`, { maxRedirects: 0 });
    if (!expected) expect(direct.status()).toBe(404);
  }
}

/** Waits until the editor reports that the server draft matches the local text. */
export async function expectSaved(page: Page, timeout = 15_000): Promise<void> {
  const state = page.getByTestId('save-state');
  await expect(state).toHaveAttribute('data-save-state', /saved|failed|invalid|conflict/, { timeout });
  if ((await state.getAttribute('data-save-state')) !== 'saved') {
    const details = await page.locator('[data-testid="save-failed-notice"], [data-testid="conflict-notice"], [id$="-error"]').allInnerTexts();
    throw new Error(`Draft not saved (${await state.getAttribute('data-save-state')}): ${details.join(' | ')}`);
  }
}

export function canvas(page: Page, locale: 'cs' | 'en' = 'cs', ui: 'cs' | 'en' = 'cs'): Locator {
  const label = ui === 'cs' ? (locale === 'cs' ? 'Text (čeština)' : 'Text (angličtina)') : locale === 'cs' ? 'Text (Czech)' : 'Text (English)';
  return page.getByRole('textbox', { name: label });
}

/** Creates a Czech (default) or English post through the "New post" form (Czech UI). */
export async function createPost(page: Page, title: string, contentLocale: 'cs' | 'en' = 'cs'): Promise<string> {
  await page.goto('/cs/admin/news/new');
  if (contentLocale === 'en') await page.getByLabel(/^Angličtina \(EN\)/).check();
  await page.getByTestId('new-post-title').fill(title);
  await page.getByTestId('new-post-submit').click();
  await expect(page).toHaveURL(new RegExp(`/cs/admin/news/[0-9a-f-]{36}\\?lang=${contentLocale}$`));
  await expect(page.getByTestId('news-editor')).toBeVisible();
  return documentIdFromUrl(page.url());
}

/** Fills the minimum publishable content (text + excerpt) and saves. */
export async function fillPublishable(page: Page, text: string, excerpt: string, locale: 'cs' | 'en' = 'cs'): Promise<void> {
  const body = canvas(page, locale);
  await body.click();
  await page.keyboard.type(text);
  await page.getByTestId('editor-excerpt').fill(excerpt);
  await page.getByTestId('editor-save').click();
  await expectSaved(page);
}

export async function publish(page: Page): Promise<void> {
  await page.getByTestId('editor-publish').click();
  await expect(page.getByTestId('editor-published')).toBeVisible();
  await expect(page.getByTestId('translation-state')).toHaveAttribute('data-state', 'published');
}
