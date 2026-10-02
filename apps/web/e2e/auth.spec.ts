import { expect, test } from '@playwright/test';
import { ageMembershipSnapshot, countSessions, setDiscordMember, signInAs } from './support/auth';

test.describe('sign-in page', () => {
  test('Czech login renders the Discord action, purpose and privacy link', async ({ page }) => {
    await page.goto('/cs/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.getByRole('heading', { level: 1, name: 'Přihlásit se' })).toBeVisible();
    const action = page.getByRole('button', { name: 'POKRAČOVAT PŘES DISCORD' });
    await expect(action).toBeVisible();
    await expect(action).toBeEnabled();
    await expect(page.getByText('Vstup na Discord server Valkyria a přihlášení zde jsou dva samostatné kroky.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Jak zpracováváme vaše údaje' })).toHaveAttribute('href', '/cs/privacy');
    // Local recovery is disabled in this environment and is not advertised.
    await expect(page.getByText('Přihlášení pro obnovení přístupu správce')).toHaveCount(0);
  });

  test('English login is localized', async ({ page }) => {
    await page.goto('/en/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'CONTINUE WITH DISCORD' })).toBeEnabled();
    await expect(page.getByText('Joining the Valkyria Discord server and signing in here are two separate steps.', { exact: false })).toBeVisible();
  });

  test('callback errors map to localized safe messages without echoing provider text', async ({ page }) => {
    await page.goto('/cs/login?error=access_denied&error_description=%3Cscript%3Eraw%20provider%20text%3C%2Fscript%3E');
    await expect(page.getByTestId('login-error')).toHaveText('Přihlášení bylo zrušeno. Můžete to kdykoli zkusit znovu.');
    await expect(page.getByText('raw provider text')).toHaveCount(0);
    await page.goto('/en/login?error=access_denied&error_description=raw%20provider%20text');
    await expect(page.getByTestId('login-error')).toHaveText('Sign-in was cancelled. You can try again at any time.');
    await expect(page.getByText('raw provider text')).toHaveCount(0);
    await page.goto('/en/login?error=state_mismatch');
    await expect(page.getByTestId('login-error')).toContainText('The sign-in attempt is invalid or has expired.');
  });

  test('malicious returnTo values are replaced by the account page', async ({ page }) => {
    for (const malicious of ['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/de/admin', '/api/auth/sign-out']) {
      await page.goto(`/cs/login?returnTo=${encodeURIComponent(malicious)}`);
      await expect(page.locator('input[name="returnTo"]')).toHaveValue('/cs/account');
    }
    await page.goto(`/en/login?returnTo=${encodeURIComponent('/en/admin')}`);
    await expect(page.locator('input[name="returnTo"]')).toHaveValue('/en/admin');
  });

  test('local recovery sign-in does not exist unless enabled', async ({ request }) => {
    expect((await request.get('/cs/login/recovery')).status()).toBe(404);
    expect((await request.get('/en/login/recovery')).status()).toBe(404);
  });

  test('public sign-up and account-linking endpoints are not served', async ({ request }) => {
    const signUp = await request.post('/api/auth/sign-up/email', {
      data: { email: 'intruder@example.test', password: 'a-long-enough-password-123', name: 'Intruder' },
    });
    expect(signUp.status()).toBe(404);
    expect((await request.post('/api/auth/link-social', { data: { provider: 'discord' } })).status()).toBe(404);
    expect(signUp.headers()['cache-control']).toContain('no-store');
  });
});

test.describe('protected routes', () => {
  test('anonymous admin requests redirect to the localized login with the exact returnTo', async ({ request, page }) => {
    const czech = await request.get('/cs/admin/news', { maxRedirects: 0 });
    expect(czech.status()).toBe(307);
    expect(czech.headers().location).toBe(`/cs/login?returnTo=${encodeURIComponent('/cs/admin/news')}`);
    const english = await request.get('/en/admin', { maxRedirects: 0 });
    expect(english.headers().location).toBe(`/en/login?returnTo=${encodeURIComponent('/en/admin')}`);
    expect(english.headers()['cache-control']).toContain('no-store');

    await page.goto('/cs/admin/news');
    await expect(page).toHaveURL(/\/cs\/login\?returnTo=%2Fcs%2Fadmin%2Fnews$/);
    await expect(page.locator('input[name="returnTo"]')).toHaveValue('/cs/admin/news');
  });

  test('anonymous account request redirects to login', async ({ request }) => {
    const response = await request.get('/en/account', { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(`/en/login?returnTo=${encodeURIComponent('/en/account')}`);
  });

  test('a member without administrative roles is denied and told so', async ({ context, page }) => {
    const member = await signInAs(context, { roles: ['member'], name: 'Synthetic Člen' });
    await page.goto('/cs/account');
    await expect(page.getByTestId('account-name')).toHaveText('Synthetic Člen');
    await expect(page.getByTestId('account-status')).toHaveAttribute('data-state', 'noAdmin');
    await expect(page.getByText('Nemáte přístup do administrace')).toBeVisible();
    await expect(page.getByTestId('account-open-admin')).toHaveCount(0);

    await page.goto('/cs/admin');
    await expect(page.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
    await expect(page.getByTestId('admin-modules')).toHaveCount(0);
    // Hidden links are convenience only: direct module URLs are denied as well.
    await page.goto('/cs/admin/news');
    await expect(page.getByTestId('access-denied')).toBeVisible();
    expect(member.userId).toBeTruthy();
  });

  test('an editor sees content modules but not settings, audit or matches', async ({ context, page }) => {
    await signInAs(context, { roles: ['editor'] });
    await page.goto('/cs/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Administrace' })).toBeVisible();
    for (const key of ['news', 'media', 'members']) await expect(page.getByTestId(`admin-module-${key}`)).toBeVisible();
    for (const key of ['settings', 'audit', 'matches']) await expect(page.getByTestId(`admin-module-${key}`)).toHaveCount(0);
    const nav = page.getByTestId('admin-nav');
    await expect(nav.getByRole('link', { name: 'Nastavení' })).toHaveCount(0);

    await page.goto('/en/admin');
    await expect(page.getByTestId('admin-module-news')).toContainText('News');
  });

  test('a removed role is enforced at the next write-intent verification', async ({ context, page }) => {
    const editor = await signInAs(context, { roles: ['editor'] });
    await page.goto('/cs/account');
    await expect(page.getByTestId('account-status')).toHaveAttribute('data-state', 'admin');

    // Two minutes later the editor role is removed in Discord.
    await ageMembershipSnapshot(editor.discordUserId, 120);
    await setDiscordMember(editor.discordUserId, { roles: [] });
    // Private reads may use a snapshot up to 5 minutes old…
    await page.goto('/cs/account');
    await expect(page.getByTestId('account-status')).toHaveAttribute('data-state', 'admin');
    // …but a write-intent verification requires ≤60 s and re-fetches from Discord.
    await page.getByTestId('account-refresh').click();
    await expect(page).toHaveURL(/\/cs\/account\?refreshed=1$/);
    await expect(page.getByTestId('account-status')).toHaveAttribute('data-state', 'noAdmin');
    await page.goto('/cs/admin');
    await expect(page.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
  });

  test('a departed member loses access and sees an unverified membership', async ({ context, page }) => {
    const editor = await signInAs(context, { roles: ['editor'] });
    await setDiscordMember(editor.discordUserId, { status: 'absent' });
    await page.goto('/en/account');
    await expect(page.getByTestId('account-status')).toHaveAttribute('data-state', 'notMember');
    await expect(page.getByText('Membership not verified')).toBeVisible();
  });

  test('a Discord outage shows a verification problem and grants nothing', async ({ context, page }) => {
    await signInAs(context, { roles: ['administrator'], membership: 'outage' });
    await page.goto('/cs/account');
    await expect(page.getByTestId('account-status')).toHaveAttribute('data-state', 'stale');
    await expect(page.getByText('Členství teď nelze ověřit')).toBeVisible();
    await page.goto('/cs/admin');
    await expect(page.getByTestId('access-denied')).toHaveAttribute('data-reason', 'stale_authorization');
    // Public content is unaffected.
    const home = await page.goto('/cs');
    expect(home?.status()).toBe(200);
  });

  test('signing out revokes the server-side session', async ({ context, page }) => {
    const member = await signInAs(context, { roles: ['member'] });
    await page.goto('/en/account');
    await page.getByTestId('account-sign-out').click();
    await expect(page).toHaveURL(/\/en$/);
    expect(await countSessions(member.userId)).toBe(0);
    const response = await page.goto('/en/account');
    expect(page.url()).toContain('/en/login?returnTo=');
    expect(response?.status()).toBe(200);
  });

  test('a signed-in visitor on the login page is offered the account and safe return only', async ({ context, page }) => {
    await signInAs(context, { roles: ['member'] });
    await page.goto(`/cs/login?returnTo=${encodeURIComponent('//evil.example')}`);
    await expect(page.getByTestId('login-signed-in')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Přejít na můj účet' })).toHaveAttribute('href', '/cs/account');
  });
});
