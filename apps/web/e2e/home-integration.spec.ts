import { expect, test } from '@playwright/test';
import { signInAs } from './support/auth';

test.describe('home and header integration', () => {
  test('Wardogs home shows its next published fixture, never a draft', async ({ page }) => {
    await page.goto('/cs/wardogs');
    const strip = page.locator('[data-next-match]');
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute('href', '/cs/wardogs/matches/ukazka-wardogs-nadchazejici');
    await expect(page.locator('a[href*="ukazka-wardogs-koncept"]')).toHaveCount(0);
    await page.goto('/en/wardogs');
    await expect(page.locator('[data-next-match]')).toHaveAttribute('href', '/en/wardogs/matches/ukazka-wardogs-nadchazejici');
  });

  test('anonymous header offers sign-in and no administration link', async ({ page }) => {
    await page.goto('/cs');
    const header = page.locator('header').first();
    await expect(header.getByRole('link', { name: /PŘIHLÁSIT SE/ })).toBeVisible();
    await expect(page.locator('a[href="/cs/admin"]')).toHaveCount(0);
  });

  test('a verified editor sees an administration link; a plain member does not', async ({ browser }) => {
    const editor = await browser.newContext();
    await signInAs(editor, { roles: ['editor'], name: 'Syntetický editor' });
    const editorPage = await editor.newPage();
    await editorPage.goto('/cs');
    await expect(editorPage.locator('a[href="/cs/admin"]').first()).toBeAttached();
    await editor.close();

    const member = await browser.newContext();
    await signInAs(member, { roles: ['member'], name: 'Syntetický člen' });
    const memberPage = await member.newPage();
    await memberPage.goto('/cs');
    await expect(memberPage.locator('a[href="/cs/admin"]')).toHaveCount(0);
    await member.close();
  });
});
