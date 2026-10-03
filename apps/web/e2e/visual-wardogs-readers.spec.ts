import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';

/**
 * Captioned screenshots of the approved Logi readers (issue #87) for PR/issue evidence.
 * Opt-in:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-wardogs-readers.spec.ts
 * Output: <repo>/.local/evidence/wardogs-readers/ (gitignored) + captures.json. Everything
 * shown comes from the labelled synthetic reader source; no Logi request, key or real
 * server/League data is involved and nothing is modified.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture the Wardogs reader screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/wardogs-readers');
const captures: { file: string; caption: string; viewport: string; uiLocale: string; role: 'visitor'; path: string }[] = [];

async function newContext(browser: Browser, width: number, height: number, locale: 'cs' | 'en'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: locale === 'cs' ? 'cs-CZ' : 'en-GB',
    timezoneId: 'Europe/Prague',
    reducedMotion: 'reduce',
    isMobile: width < 768,
    hasTouch: width < 768,
  });
  return { context, page: await context.newPage() };
}

async function shot(page: Page, file: string, caption: string, uiLocale: 'cs' | 'en', fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, file), animations: 'disabled', caret: 'hide', fullPage });
  const viewport = page.viewportSize();
  captures.push({ file, caption, viewport: `${viewport?.width}x${viewport?.height}`, uiLocale, role: 'visitor', path: new URL(page.url()).pathname + new URL(page.url()).search });
}

test.beforeAll(() => mkdirSync(outDir, { recursive: true }));
test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

for (const [locale, width, height] of [['cs', 1440, 1050], ['en', 1440, 1050], ['cs', 390, 844], ['en', 390, 844]] as const) {
  test(`server detail with Warcon live facts and recent rounds (${locale}, ${width}px)`, async ({ browser }) => {
    const { context, page } = await newContext(browser, width, height, locale);
    await page.goto(`/${locale}/wardogs/servers?server=synthetic-wardogs`);
    await expect(page.locator('[data-server-refresh]')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('[data-warcon-live="synthetic-wardogs"]')).toHaveAttribute('data-warcon-freshness', 'fresh');
    await expect(page.locator('[data-warcon-matches="synthetic-wardogs"] [data-warcon-match]')).toHaveCount(5);
    await shot(page, `server-detail-warcon-${locale}-${width}x${height}.png`,
      `Visitor, /${locale}/wardogs/servers?server=synthetic-wardogs at ${width}×${height}: the synthetic Wardogs server detail followed by the "Live (Warcon)" section (synthetic-data note, map, players 0 / 98, named scores Alpha 0 · Bravo 12 · Charlie 7, round time, rotation, "Current" freshness badge with the observation time) and the "Recent matches" list of five synthetic rounds with peak players, final scores and winner; no player rows, Steam IDs or connection identifiers.`,
      locale);
    await context.close();
  });

  test(`match page with the unverified League preview (${locale}, ${width}px)`, async ({ browser }) => {
    const { context, page } = await newContext(browser, width, height, locale);
    await page.goto(`/${locale}/wardogs/matches/${FIXTURE_SLUGS.matches.upcoming}`);
    await expect(page.locator('[data-league-preview]')).toHaveAttribute('data-league-state', 'fresh');
    await page.locator('[data-league-preview]').scrollIntoViewIfNeeded();
    await shot(page, `match-league-preview-${locale}-${width}x${height}.png`,
      `Visitor, /${locale}/wardogs/matches/${FIXTURE_SLUGS.matches.upcoming} at ${width}×${height}: the published upcoming Wardogs fixture with its CMS result block (no result yet) and, below, the "League preview" section labelled as an unverified preview from Wardogs League with synthetic-data note, fixture number and title, type/status/scheduled time, three team codes with names, map/zone/lighting, hosting, map vote, four progress steps, the observation time badge and the source link; the preview shows no result.`,
      locale);
    await context.close();
  });
}
