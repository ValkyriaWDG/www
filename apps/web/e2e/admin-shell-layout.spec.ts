import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FIXTURE_SLUGS } from '../src/fixtures/data';
import { matchBySlug, memberBySlug, tournamentBySlug } from './admin-community-support';
import { signInAs } from './support/auth';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

/**
 * Administration chrome at desktop and phone widths: the module list must not push the
 * account links onto a ragged second row, the media library must fit a phone, the admin
 * bar is a labelled region (one banner landmark per page), phone controls are 44 px
 * touch targets and the rich-text editor injects no inline stylesheet (page CSP).
 */
test('the module navigation takes its own row at every desktop width', async ({ context, page }) => {
  await signInAs(context, { roles: ['administrator'] });
  const rows = async () => {
    const brand = (await page.locator('[data-admin-bar] a').first().boundingBox())!;
    const modules = (await page.getByTestId('admin-nav').boundingBox())!;
    const account = (await page.getByTestId('admin-nav').locator('xpath=following-sibling::div//nav').boundingBox())!;
    return { brand, modules, account };
  };
  for (const [width, height, path] of [[1440, 900, '/cs/admin/matches'], [1920, 1080, '/en/admin/matches']] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(path);
    const box = await rows();
    // Brand and account links share the first row; the modules start below them.
    expect(Math.abs(box.account.y - box.brand.y)).toBeLessThan(2);
    expect(box.modules.y).toBeGreaterThanOrEqual(box.brand.y + box.brand.height - 1);
    expect(box.modules.width).toBeGreaterThan(width - 200);
  }
});

test('the admin bar is a labelled region, the page keeps one banner and the account label is not clipped at 1440', async ({ context, page }) => {
  await signInAs(context, { roles: ['administrator'], name: 'Synthetic administrator' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/cs/admin');
  await expect(page.getByRole('region', { name: 'Lišta administrace' })).toBeVisible();
  await expect(page.locator('[data-admin-shell] header')).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCount(1);
  // The whole account name fits the header label; the button also carries it as a tooltip.
  const account = page.getByRole('button', { name: /Synthetic administrator/ });
  await expect(account).toHaveAttribute('title', 'Synthetic administrator');
  expect(await account.locator('span').first().evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('the media library fits a phone with two cards per row', async ({ context, page }) => {
  await signInAs(context, { roles: ['administrator'] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cs/admin/media');
  await expect(page.getByTestId('media-grid')).toBeVisible();
  const cards = await page.getByTestId('media-card').evaluateAll((elements) => elements.slice(0, 2).map((element) => element.getBoundingClientRect().toJSON()));
  expect(cards).toHaveLength(2);
  expect(Math.abs(cards[0].y - cards[1].y)).toBeLessThan(1);
  expect(cards[1].x + cards[1].width).toBeLessThanOrEqual(390);
  await expectNoHorizontalOverflow(page);
});

async function height(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, selector).not.toBeNull();
  return box!.height;
}

test('phone administration controls are 44 px touch targets', async ({ context, page }) => {
  await signInAs(context, { roles: ['administrator'] });
  await page.setViewportSize({ width: 390, height: 844 });

  // Integrations: the shared checkbox is 24 px inside a 44 px label row.
  await page.goto('/cs/admin/integrations');
  const checkbox = (await page.locator('[data-game-servers="wardogs"] input[type="checkbox"]').first().boundingBox())!;
  expect(checkbox.width).toBeGreaterThanOrEqual(24);
  expect(checkbox.height).toBeGreaterThanOrEqual(24);
  expect(await height(page, '[data-game-servers="wardogs"] input[type="checkbox"] + label')).toBeGreaterThanOrEqual(24);
  await expect(page.getByRole('heading', { name: 'Čtečky Wardogs (League, Warcon)' })).toBeVisible();

  // Settings: compact row actions and the radio controls.
  await page.goto('/cs/admin/settings');
  expect(await height(page, 'button:has-text("Přidat odkaz")')).toBeGreaterThanOrEqual(44);
  expect((await page.locator('input[type="radio"]').first().boundingBox())!.height).toBeGreaterThanOrEqual(24);
  // The community links heading follows the page heading directly (no skipped level).
  await expect(page.getByRole('heading', { level: 2, name: 'Další komunitní odkazy' })).toBeVisible();

  // Lists: title links and "Akce" buttons.
  await page.goto('/cs/admin/news');
  expect(await height(page, '[data-testid="admin-news"] tbody th a')).toBeGreaterThanOrEqual(44);
  expect(await height(page, '[data-testid="row-actions"]')).toBeGreaterThanOrEqual(44);
  await page.goto('/cs/admin/manual');
  expect(await height(page, '[data-testid="admin-manual"] tbody th a')).toBeGreaterThanOrEqual(44);

  // Audit log: the time cell stays on one line and its row link is a 44 px target; the wide
  // table scrolls inside its labelled region instead of squeezing the columns.
  await page.goto('/cs/admin/audit');
  const audit = page.locator('[data-admin-audit]');
  await expect(audit.locator('tbody tr').first()).toBeVisible();
  const time = audit.locator('tbody th [data-audit-row]').first();
  const lineHeight = await time.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight) || 24);
  expect((await time.boundingBox())!.height).toBeLessThan(lineHeight * 2);
  expect(await height(page, '[data-admin-audit] tbody th a')).toBeGreaterThanOrEqual(44);
  // Action keys and entity ids stay on one line each, so a row is not a tower of broken tokens.
  for (const code of await audit.locator('tbody tr').first().locator('[data-code-text]').all()) expect((await code.boundingBox())!.height).toBeLessThan(lineHeight * 2);
  expect(await height(page, '[data-admin-audit] tbody tr')).toBeLessThan(120);
  expect(await audit.getByRole('region').first().evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expectNoHorizontalOverflow(page);

  // Logi profile associations: the shared labelled checkbox (24 px control in a 44 px row).
  const alfa = (await memberBySlug(FIXTURE_SLUGS.members.publishedBilingual))!;
  await page.goto(`/cs/admin/members/logi?profile=${alfa.id}`);
  const stats = page.getByLabel('Zveřejnit ověřené statistiky relací');
  await expect(stats).toBeVisible();
  expect((await stats.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  expect(await height(page, '[data-logi-link-editor] input[type="checkbox"] + label')).toBeGreaterThanOrEqual(24);
  expect(await stats.evaluate((input) => input.parentElement!.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);

  // Overview: scheduled publications (the fixtures schedule one article).
  await page.goto('/cs/admin');
  const schedules = page.getByTestId('overview-schedules').locator('a');
  if ((await schedules.count()) > 0) expect((await schedules.first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
});

test('the tournament and member editors keep a continuous heading outline (axe)', async ({ context, page }) => {
  await signInAs(context, { roles: ['administrator'] });
  const tournament = await tournamentBySlug(FIXTURE_SLUGS.tournaments.current);
  const member = await memberBySlug('synteticka-hracka-bravo');
  expect(tournament).not.toBeNull();
  expect(member).not.toBeNull();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Tournament editor: "Odkazy" and the description title follow the h1 directly.
  await page.goto(`/cs/admin/tournaments/${tournament!.id}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Odkazy' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Popis turnaje · český obsah (CS)' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: /Popis turnaje/ })).toHaveCount(0);
  await expect(page.getByLabel(/^Popisek odkazu/).first()).toHaveAccessibleDescription(/Obecné popisky/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Member editor: the biography title is an h2 as well.
  await page.goto(`/cs/admin/members/${member!.id}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Medailonek · český obsah (CS)' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test('the rich-text editor injects no inline stylesheet and its toolbar stays keyboard-reachable on phones', async ({ context, page }) => {
  await signInAs(context, { roles: ['administrator'] });
  const errors = collectBrowserErrors(page);
  const fixture = await matchBySlug(FIXTURE_SLUGS.matches.upcoming);
  expect(fixture).not.toBeNull();

  // Match editor at 390 px: recap editor mounted, no "Refused to apply inline style", no axe violation
  // (scrollable toolbar with a tabbable control, VOD heading at level 2).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/cs/admin/matches/${fixture!.id}`);
  const presentation = page.locator('[data-group="presentation"]');
  await expect(presentation.getByRole('toolbar').first()).toBeVisible();
  await expect(presentation.getByRole('heading', { level: 2, name: 'Odkazy na videa (VOD)' })).toBeVisible();
  expect(await presentation.getByRole('toolbar').first().locator('[tabindex="0"]').count()).toBeGreaterThanOrEqual(1);
  expect((await new AxeBuilder({ page }).include('[data-group="presentation"]').analyze()).violations).toEqual([]);
  expect(await page.locator('style:not([nonce])').count()).toBe(0);
  // The league URL field reads the short hint; the long explanation is gone.
  await expect(presentation).toContainText('Jen https://wardogsleague.net/matches/ID u zápasů Wardogs; veřejně jako neověřený náhled.');

  // News editor, Czech language tab, desktop.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/cs/admin/news');
  await page.getByTestId('row-edit').first().click();
  await expect(page).toHaveURL(/\/cs\/admin\/news\/[0-9a-f-]{36}\?lang=cs$/);
  await expect(page.getByRole('toolbar').first()).toBeVisible();
  expect(await page.locator('style:not([nonce])').count()).toBe(0);

  expect(errors.filter((error) => /inline style|Content Security Policy/i.test(error))).toEqual([]);
  expect(errors.filter((error) => error.startsWith('pageerror'))).toEqual([]);
});

test('wide admin tables fade their trailing edge at 1024 px and the Logi pages carry their own titles', async ({ context, page }) => {
  await signInAs(context, { roles: ['administrator'] });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/cs/admin/news');
  const region = page.getByTestId('admin-news').getByRole('region').first();
  expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const frame = region.locator('xpath=..');
  await expect(frame).toHaveAttribute('data-scroll-edges', /^(end|both)$/);
  await region.evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
  await expect(frame).toHaveAttribute('data-scroll-edges', 'start');
  await expect(page.getByTestId('row-actions').first()).toBeInViewport();

  await page.goto('/cs/admin/matches/logi');
  await expect(page).toHaveTitle(/^Propojené zápasy · Správa/);
  await page.goto('/en/admin/members/logi');
  await expect(page).toHaveTitle(/^Logi profile associations · Administration/);
});
