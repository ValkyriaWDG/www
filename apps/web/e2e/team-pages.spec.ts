import { expect, test } from '@playwright/test';
import { signInAs } from './support/auth';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

/**
 * Member team pages without a configured Logi people synchronization: one honest notice
 * and quiet section placeholders, no shouting empty states, on desktop and phones.
 */
test('team pages explain the unconfigured synchronization quietly in both languages', async ({ context, page }) => {
  await signInAs(context, { roles: ['member'] });
  for (const [locale, path, width] of [['cs', '/cs/hll/team', 1440], ['en', '/en/wardogs/team', 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await expect(page).toHaveTitle(locale === 'cs' ? 'Přehled týmu – Hell Let Loose · Valkyria' : 'Team overview – Wardogs · Valkyria');
    const team = page.locator('[data-logi-team="unconfigured"]');
    await expect(team).toBeVisible();
    await expect(team).toContainText(locale === 'cs' ? 'Synchronizace týmu není nakonfigurovaná.' : 'Team synchronization is not configured.');
    const placeholder = locale === 'cs' ? 'Zatím nejsou synchronizované záznamy.' : 'No synchronized records yet.';
    await expect(team.getByText(placeholder)).toHaveCount(3);
    await expect(team.getByRole('heading', { name: placeholder })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  }
});
