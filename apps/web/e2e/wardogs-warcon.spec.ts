import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FIXTURE_SLUGS } from '../src/fixtures/data';

/*
 * Approved Logi readers (issue #87) against the labelled synthetic reader source
 * (`LOGI_READERS_SOURCE=synthetic-fixture`, e2e/support/server-env.ts): the Warcon live
 * facts and recent rounds of the synthetic Wardogs server and the unverified League preview
 * of the upcoming Wardogs fixture, in cs/en at 1440 and 390 px. The home overview carries
 * no Warcon section by design (short-window utility rail).
 * No Logi request, key or real server/League data is involved.
 */

const LABELS = {
  cs: { live: 'Živě (Warcon)', recent: 'Poslední zápasy', league: 'Náhled z League', result: 'Výsledek', current: 'Aktuální' },
  en: { live: 'Live (Warcon)', recent: 'Recent matches', league: 'League preview', result: 'Result', current: 'Current' },
} as const;
const FORBIDDEN_TEXT = /7656119\d{10}|Never Public|join-code|00000000-0000-4000-8000-000000000000|synthetic-warcon-connection/;

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`Wardogs server detail shows Warcon live facts and recent rounds: ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect((await page.goto(`/${locale}/wardogs/servers?server=synthetic-wardogs`))?.status()).toBe(200);
      await expect(page.locator('[data-server-refresh]')).toHaveAttribute('aria-busy', 'false');
      const panel = page.locator('[data-warcon-panel="synthetic-wardogs"]');
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('heading', { name: LABELS[locale].live })).toBeVisible();
      await expect(panel.locator('[data-synthetic-data="warcon"]').first()).toBeVisible();
      const live = panel.locator('[data-warcon-live="synthetic-wardogs"]');
      await expect(live).toHaveAttribute('data-warcon-freshness', 'fresh');
      await expect(live).toContainText('Synthetic Training Ground');
      await expect(live).toContainText('12 / 98');
      await expect(live.locator('[data-warcon-scores] li')).toHaveText([/Alpha\s*0/, /Bravo\s*12/, /Charlie\s*7/]);
      await expect(live).toContainText(LABELS[locale].current);
      await expect(panel.getByRole('heading', { name: LABELS[locale].recent })).toBeVisible();
      const recent = panel.locator('[data-warcon-matches="synthetic-wardogs"]');
      await expect(recent).toHaveAttribute('data-warcon-freshness', 'fresh');
      await expect(recent.locator('[data-warcon-match]')).toHaveCount(5);
      // Player rows, Steam IDs, join codes and panel/connection identifiers never reach the page.
      expect(await page.locator('main').innerText()).not.toMatch(FORBIDDEN_TEXT);
      expect(await page.content()).not.toMatch(FORBIDDEN_TEXT);
      await expect(page.locator('main')).not.toContainText(/Allies|Axis|Spojenci/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    });

    test(`Wardogs match page shows the unverified League preview without a result: ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect((await page.goto(`/${locale}/wardogs/matches/${FIXTURE_SLUGS.matches.upcoming}`))?.status()).toBe(200);
      const preview = page.locator('[data-league-preview]');
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute('data-league-state', 'fresh');
      await expect(preview.getByRole('heading', { name: LABELS[locale].league })).toBeVisible();
      await expect(preview.locator('[data-synthetic-data="league"]')).toBeVisible();
      await expect(preview).toContainText('[SYNTHETIC] SYA · SYB · SYC (synthetic-fixture-alpha)');
      await expect(preview.locator('[data-league-teams] li')).toHaveCount(3);
      await expect(preview.locator('[data-league-progress] li')).toHaveCount(4);
      await expect(preview.getByRole('link', { name: /Wardogs League/ })).toHaveAttribute('href', 'https://wardogsleague.net/matches/synthetic-fixture-alpha');
      // The preview carries no result; the CMS result block stays the only result and the fixture has none.
      await expect(preview).not.toContainText(LABELS[locale].result);
      await expect(page.locator('[data-match-detail] [data-result="pending"], [data-match-detail] [data-result="unpublished"]').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await new AxeBuilder({ page }).include('[data-league-preview]').analyze()).violations).toEqual([]);
    });
  }
}

test('the Wardogs home keeps the compact server overview without a Warcon section', async ({ page }) => {
  await page.goto('/cs/wardogs');
  const banner = page.locator('[data-home-servers]');
  await expect(banner).toHaveAttribute('aria-busy', 'false');
  await expect(banner.locator('[data-synthetic-data]')).toHaveCount(1);
  await expect(banner.locator('[data-warcon-live], [data-warcon-panel]')).toHaveCount(0);
  await expect(banner).not.toContainText('Warcon');
});

test('the polling route carries the Warcon DTO only for listed approved servers and no identities', async ({ request }) => {
  const detail = await request.get('/api/servers/wardogs?server=synthetic-wardogs');
  expect(detail.status()).toBe(200);
  const body = await detail.json();
  expect(body.warcon).toHaveLength(1);
  expect(body.warcon[0]).toMatchObject({ publicId: 'synthetic-wardogs', synthetic: true, live: { freshness: 'fresh', map: 'Synthetic Training Ground', playerCount: 12, maxPlayers: 98 } });
  expect(body.warcon[0].recentMatches.matches).toHaveLength(5);
  expect(Object.keys(body.warcon[0].live).sort()).toEqual(['freshness', 'lighting', 'map', 'matchSeconds', 'maxPlayers', 'observedAt', 'playerCount', 'publicId', 'rotationNext', 'rotationNow', 'scores', 'serverName']);
  // The HLL live-players DTO legitimately has a `players` array; the Warcon projection never does.
  expect(JSON.stringify(body.warcon)).not.toMatch(/steamId|serverId|gameServerId|connectionId|7656119|players"/);
  expect(JSON.stringify(body)).not.toMatch(/steamId|7656119|gameServerId|connectionId/);
  const list = await request.get('/api/servers/wardogs');
  expect((await list.json()).warcon[0].recentMatches).toBeNull();
  expect((await request.get('/api/servers/wardogs?connection=synthetic-warcon-connection')).status()).toBe(400);
  expect((await request.get('/api/servers/wardogs?server=synthetic-wardogs&view=players')).status()).toBe(400);
  const hll = await request.get('/api/servers/hll');
  expect((await hll.json()).warcon).toBeNull();
});
