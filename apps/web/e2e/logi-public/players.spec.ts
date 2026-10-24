import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../../src/fixtures/data';
import { expectNoHorizontalOverflow } from '../support/shell-helpers';

test.skip(process.env.E2E_PUBLIC_PLAYER_FIXTURES !== '1', 'Enable E2E_PUBLIC_PLAYER_FIXTURES=1 for explicitly public synthetic gaming names.');
const name = '[SYNTHETIC] Public Player Alpha';
const forbidden = /PRIVATE_OPERATIONAL_NAME|PRIVATE_OPERATIONAL_GROUP|PRIVATE_BASIC_GROUP|PRIVATE_MOCK_|private-mock-|private-basic-|private-unresolved-|private-member-|private-identity-|91000000000000000[123]|"discordSubject"|"identityId"|"identityBinding"|"connectionId"/;

async function safe(page: Page) {
  const match = (await page.content()).match(forbidden)?.[0] ?? null;
  expect(match, 'Private field in public player response').toBeNull();
  await expectNoHorizontalOverflow(page);
}
async function capture(page: Page, file: string, caption: string) {
  if (process.env.CAPTURE_EVIDENCE !== '1') return;
  const dir = path.resolve('.local/evidence/public-players');
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, `${file}.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
  writeFileSync(path.join(dir, `${file}.json`), `${JSON.stringify({ caption, kind: 'synthetic-local-browser-screenshot', route: new URL(page.url()).pathname + new URL(page.url()).search, viewport: page.viewportSize(), capturedAt: new Date().toISOString() }, null, 2)}\n`);
}

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1280, 390]) {
    test(`${locale} ${width}: public players share one directory, game details and published match lineups`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/${locale}/members`);
      const roster = page.locator('[data-member-roster]');
      await expect(roster.locator('tbody tr')).toHaveCount(9); // Four personal profiles + five distinct source identities.
      await expect(roster.locator(`a[href*="/members/${FIXTURE_SLUGS.members.publishedCsOnlyBio}"]`)).toHaveCount(1);
      await expect(roster.getByText(name, { exact: true })).toHaveCount(1);
      await expect(page.getByRole('search')).toHaveCount(1);
      await safe(page);
      await capture(page, `directory-${locale}-${width}`, 'One synthetic public directory: approved personal profiles and owner-published supplied gaming names, exact cross-game identity deduplication, shared filters and no private membership fields.');

      await page.getByRole('searchbox').fill('Public Player Alpha');
      await page.getByRole('searchbox').press('Enter');
      await expect(page.locator('[data-member-roster] tbody tr')).toHaveCount(1);
      const link = page.locator('[data-member-roster] tbody tr th a');
      const href = await link.getAttribute('href');
      expect(href).toMatch(new RegExp(`^/${locale}/players/[a-f0-9]{64}\\?q=Public\\+Player\\+Alpha$`));
      const key = href!.match(/\/players\/([a-f0-9]{64})/)![1]!;
      await link.click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
      await expect(page.locator('[data-public-player-profile]')).toContainText('Hell Let Loose');
      await expect(page.locator('[data-public-player-profile]')).toContainText('Wardogs');
      for (const game of ['hll', 'wardogs']) await expect(page.locator(`a[href="/${locale}/${game}/matches/logi/synthetic-next-${game === 'hll' ? 'hell_let_loose' : game}"]`)).toHaveCount(1);
      const statistics = page.locator('[data-public-player-statistics]');
      await expect(statistics).toHaveCount(2);
      await expect(page.getByRole('heading', { name: locale === 'cs' ? 'Statistiky hráče' : 'Player statistics', exact: true })).toHaveCount(2);
      await expect(page.getByRole('heading', { name: locale === 'cs' ? 'Statistiky načtených herních relací' : 'Collected session statistics', exact: true })).toHaveCount(0);
      for (const stats of await statistics.all()) {
        await expect(stats).toContainText(locale === 'cs' ? '57 veřejně zaznamenaných zápasů' : '57 publicly recorded matches');
        await expect(stats).toContainText(locale === 'cs' ? 'napříč všemi týmy' : 'across all teams');
        await expect(stats.locator('dl').getByText(new Intl.NumberFormat(locale).format(1234), { exact: true })).toHaveCount(1);
        await expect(stats.locator('ul > li')).toHaveCount(30);
        await expect(stats).toContainText('Synthetic Recorded Map');
        const older = stats.locator('details');
        const latest = stats.locator('ul > li');
        await expect(older).toHaveCount(1);
        await expect(older).not.toHaveAttribute('open', '');
        await expect(latest.nth(4)).toBeVisible();
        await expect(latest.last()).toBeHidden();
        await expect(older.locator('ul > li')).toHaveCount(25);
        await older.locator('summary').focus();
        await older.locator('summary').press('Enter');
        await expect(older).toHaveAttribute('open', '');
        await expect(latest.last()).toBeVisible();
        await older.locator('summary').click();
        await expect(older).not.toHaveAttribute('open', '');
        await expect(latest.last()).toBeHidden();
      }
      await expect(page.locator('[aria-labelledby="player-wardogs"]')).toContainText('-321');
      await expect(page.locator('[aria-labelledby="player-wardogs"]')).toContainText('-100');
      await expect(page.locator('[aria-labelledby="player-hell-let-loose"]')).toContainText(locale === 'cs' ? 'Útok: 10' : 'Offense: 10');
      await expect(page.locator('[data-member-profile]')).toHaveCount(0);
      await safe(page);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await capture(page, `player-${locale}-${width}`, 'Synthetic player detail: supplied name, both exact game affiliations, published lineup links, 57 all-team recorded matches, latest5 visible and25 expandable history rows per game, HLL scores and signed Wardogs money. Keyboard expansion is verified before this collapsed capture. No biography/consent is fabricated and no attendance or private IDs are exposed.');

      for (const game of ['hll', 'wardogs']) {
        await page.goto(`/${locale}/${game}/members?q=Public`);
        await expect(page.locator('[data-member-roster] tbody tr')).toHaveCount(2);
        await expect(page.locator(`[data-member-roster] a[href*="/players/${key}"]`)).toHaveCount(1);
        await page.goto(`/${locale}/${game}/players/${key}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
        await expect(page.locator('[data-public-player-profile]')).toHaveText(game === 'hll' ? 'Hell Let Loose' : 'Wardogs');
        await safe(page);
      }
      await page.goto(`/${locale}/hll/matches/logi/synthetic-next-hell_let_loose`);
      const lineup = page.locator('[aria-labelledby="match-logi-people"]');
      await expect(lineup.locator('ul > li')).toHaveCount(3);
      await expect(lineup.getByRole('link', { name, exact: true })).toHaveAttribute('href', `/${locale}/players/${key}`);
      await expect(lineup).toContainText('[SYNTHETIC] Public HLL Bravo');
      await expect(lineup).not.toContainText(/acknowledged|attending|passed/);
      await safe(page);
      await page.goto(`/${locale}/members?q=Public&role=officer`);
      await expect(page.locator('[data-member-roster]')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
  test(`${locale}: player URLs are game-scoped and private identifiers never resolve as public keys`, async ({ page }) => {
    await page.goto(`/${locale}/wardogs/members?q=Public+WDG+Bravo`);
    const href = await page.locator('[data-member-roster] tbody tr th a').getAttribute('href');
    const key = href!.match(/\/players\/([a-f0-9]{64})/)![1]!;
    for (const target of [`/${locale}/hll/players/${key}`, `/${locale}/players/private-basic-shared-identity`, `/${locale}/players/${'0'.repeat(64)}`]) {
      expect((await page.goto(target))?.status()).toBe(404);
      await expect(page.locator('[data-public-player-profile]')).toHaveCount(0);
    }
  });
}
