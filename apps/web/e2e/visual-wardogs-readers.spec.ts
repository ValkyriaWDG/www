import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';

/**
 * Captioned screenshots of the approved Logi readers (issue #87) and of the retained
 * Warcon server game history (`-g history` selects those) for PR/issue evidence.
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

  test(`matches page with the tracked League fixtures (${locale}, ${width}px)`, async ({ browser }) => {
    const { context, page } = await newContext(browser, width, height, locale);
    await page.goto(`/${locale}/wardogs/matches`);
    await expect(page.locator('[data-league-fixtures]')).toHaveAttribute('data-league-fixtures-state', 'fresh');
    await expect(page.locator('[data-league-fixture]')).toHaveCount(3);
    await page.locator('[data-league-fixtures]').scrollIntoViewIfNeeded();
    await shot(page, `matches-league-fixtures-${locale}-${width}x${height}.png`,
      `Visitor, /${locale}/wardogs/matches at ${width}×${height}: the Upcoming list of the Wardogs section followed by the "Tracked Wardogs League fixtures" section labelled as an unverified overview with synthetic-data note and three synthetic fixtures (two current tracked fixtures with kickoff, three team codes with names, map · zone · lighting, type/status and links to Wardogs League and, for the alpha fixture, to the clan's own match page; one paused fixture without a kickoff marked stale); no result appears.`,
      locale);
    await context.close();
  });
}

const HISTORY = '/wardogs/history?server=synthetic-wardogs';

for (const [locale, width, height] of [['cs', 1440, 1050], ['en', 1440, 1050], ['cs', 390, 844], ['en', 390, 844]] as const) {
  test(`server game history overview (${locale}, ${width}px)`, async ({ browser }) => {
    const { context, page } = await newContext(browser, width, height, locale);
    await page.goto(`/${locale}${HISTORY}`);
    await expect(page.locator('[data-history-state]')).toHaveAttribute('data-history-state', 'fresh');
    await expect(page.locator('[data-history-game]')).toHaveCount(12);
    await shot(page, `history-overview-${locale}-${width}x${height}.png`,
      `Visitor, /${locale}${HISTORY} at ${width}×${height}: the "Server game history" page of the Wardogs section (menu entry current) with the synthetic-data note and the "not clan results" note, the GET filter form (server, period "Last 30 days", map, minimum playtime 60), the summary tiles (12 games, 10 decided · 2 draws · 0 without a result, 11 of 12 games with complete statistics, first/last game, last Logi import, loaded time), the faction win-share bars in the factions' published colours (Bravo 4 / 10 · 40 %, Alpha 3 / 10 · 30 %, Charlie 3 / 10 · 30 %, draws listed separately), the player rankings of the 24 synthetic players sorted by kills and the 12 games of the period, newest first, with scores, outcome badges and the collapsed player details. Everything shown is synthetic.`,
      locale);
    await context.close();
  });

  test(`server game history ranking sorted by K/D (${locale}, ${width}px)`, async ({ browser }) => {
    const { context, page } = await newContext(browser, width, height, locale);
    await page.goto(`/${locale}${HISTORY}&period=all&sort=kd`);
    await expect(page.locator('[data-history-ranking] th[aria-sort="descending"] [data-history-sort="kd"]')).toBeVisible();
    // Phones: viewport capture with the ranking's header row at the top (the full page is 7 500 px tall).
    await page.locator('[data-history-players]').evaluate((section) => section.scrollIntoView({ block: 'start' }));
    await shot(page, `history-ranking-kd-${locale}-${width}x${height}.png`,
      `Visitor, /${locale}${HISTORY}&period=all&sort=kd at ${width}×${height}: the whole synthetic history (23 games; 19 decided · 2 draws · 1 without a result · 1 unknown; Bravo 8 / 19 · 42 %, Alpha 6 / 19 · 32 %, Charlie 5 / 19 · 26 %) with the player rankings sorted by K/D descending (the marked header and the K/D column are visible on the desktop capture and lie inside the scroll region on the phone; Player 01 first, the zero-deaths Player 24 last with "—"), signed negative cash deltas, the renamed player under its latest name and the "(from 11 games)" coverage marker where a total does not cover every game; the feed-only group is collapsed on the phone capture. Everything shown is synthetic.`,
      locale, width !== 390);
    await context.close();
  });

  test(`server game history with an expanded game (${locale}, ${width}px)`, async ({ browser }) => {
    const { context, page } = await newContext(browser, width, height, locale);
    await page.goto(`/${locale}${HISTORY}&period=all`);
    const game = page.locator('[data-history-game="synthetic-game-01"]');
    await game.locator('summary').click();
    await expect(game.locator('[data-history-game-player]')).toHaveCount(11);
    await game.scrollIntoViewIfNeeded();
    await shot(page, `history-game-expanded-${locale}-${width}x${height}.png`,
      `Visitor, /${locale}${HISTORY}&period=all at ${width}×${height}: the game list (20 of 23 games on page 1 with pagination) with the newest synthetic game expanded through its native details control: end time, map · mode · lighting, final scores Alpha 100 · Bravo 35 · Charlie 35 with colour chips, the "Winner: Alpha" badge and the 11 players grouped by faction with result, playtime, kills, deaths, signed cash delta and the feed metrics in a scrollable table. Everything shown is synthetic.`,
      locale);
    await context.close();
  });

  test(`server game history empty state (${locale}, ${width}px)`, async ({ browser }) => {
    const { context, page } = await newContext(browser, width, height, locale);
    await page.goto(`/${locale}${HISTORY}&period=7d&map=Synthetic+Nowhere`);
    await expect(page.locator('[data-history-empty]')).toBeVisible();
    await shot(page, `history-empty-${locale}-${width}x${height}.png`,
      `Visitor, /${locale}${HISTORY}&period=7d&map=Synthetic+Nowhere at ${width}×${height}: the 7-day period narrowed to a map with no game (the synthetic 7-day window itself holds three games) shows the filter form with the selection, the "no games match the selected filters" empty state and the reset link instead of empty summary, faction, ranking and game sections. Everything shown is synthetic.`,
      locale);
    await context.close();
  });

  test(`server detail with the compact game history (${locale}, ${width}px)`, async ({ browser }) => {
    const { context, page } = await newContext(browser, width, height, locale);
    await page.goto(`/${locale}/wardogs/servers?server=synthetic-wardogs`);
    await expect(page.locator('[data-server-refresh]')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('[data-history-summary="synthetic-wardogs"]')).toHaveAttribute('data-history-state', 'fresh');
    await page.locator('[data-history-summary="synthetic-wardogs"]').scrollIntoViewIfNeeded();
    await shot(page, `server-detail-history-${locale}-${width}x${height}.png`,
      `Visitor, /${locale}/wardogs/servers?server=synthetic-wardogs at ${width}×${height}: below the "Live (Warcon)" and "Recent matches" sections, the compact "Game history" summary of the synthetic Wardogs server with the synthetic-data note, "12 games in the last 30 days", the compact faction win-share bars (Bravo 4 / 10 · 40 %, Alpha 3 / 10 · 30 %, Charlie 3 / 10 · 30 %), the last three games with end time, map and outcome badge and the "Full server history" link to the history page of this server. Everything shown is synthetic.`,
      locale);
    await context.close();
  });
}
