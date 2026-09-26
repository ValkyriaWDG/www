import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { countSessions, E2E_ROLE_IDS, setDiscordMember, setDiscordOutage, signInAs } from './support/auth';

const endpoint = '/api/integrations/discord/role-sync';
const key = 'e2e-role-sync-key-not-for-production-0000';
const proofDir = path.resolve('../../.local/evidence/role-sync');
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
async function send(request: APIRequestContext, userId: string, roles: string[], state: 'present' | 'left') {
  const body = JSON.stringify({ schemaVersion: 1, eventId: randomUUID(), guildId: '100000000000000001', userId, roleIds: roles, membershipState: state, observedAt: new Date().toISOString(), sequence: '1' });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const signature = createHmac('sha256', key).update(`POST\n${endpoint}\nfixture\n${timestamp}\n${nonce}\n${body}`).digest('hex');
  const response = await request.post(endpoint, { data: body, headers: { 'content-type': 'application/json', 'x-valkyria-key-id': 'fixture', 'x-valkyria-timestamp': timestamp, 'x-valkyria-nonce': nonce, 'x-valkyria-signature': signature } });
  expect(response.status()).toBe(204);
  expect(response.headers()['cache-control']).toContain('no-store');
}

async function capture(page: Page, info: TestInfo, file: string, caption: string) {
  await page.bringToFront();
  await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  const image = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  await info.attach(file, { body: image, contentType: 'image/png' });
  await info.attach(`${file} caption`, { body: caption, contentType: 'text/plain' });
  if (process.env.CAPTURE_EVIDENCE === '1') {
    mkdirSync(proofDir, { recursive: true });
    writeFileSync(path.join(proofDir, file), image);
    writeFileSync(path.join(proofDir, `${file}.json`), `${JSON.stringify({ file, caption, capturedAt: new Date().toISOString(), locale: await page.locator('html').getAttribute('lang'), viewport: page.viewportSize(), route: new URL(page.url()).pathname, environment: 'Local production build with synthetic PostgreSQL identity and simulated Discord REST; no live Discord' }, null, 2)}\n`);
  }
}

for (const locale of ['cs', 'en'] as const) {
  test(`${locale}: signed departure revokes a previously authorized Discord session`, async ({ context, page, request }, info) => {
    const identity = await signInAs(context, { roles: ['editor'], name: 'Synthetic role-sync editor' });
    await page.goto(`/${locale}/account`);
    await expect(page.getByTestId('account-status')).toHaveAttribute('data-state', 'admin');
    await expect(page.getByTestId('account-open-admin')).toBeVisible();
    await capture(page, info, `authorized-${locale}.png`, `${locale.toUpperCase()} account before the signed event. The synthetic editor has a fresh server-side Discord REST observation and administration access.`);
    await setDiscordMember(identity.discordUserId, { status: 'absent' });
    await send(request, identity.discordUserId, [], 'left');
    expect(await countSessions(identity.userId)).toBe(0);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?returnTo=`));
    await expect(page.getByRole('heading', { level: 1, name: locale === 'cs' ? 'Přihlásit se' : 'Sign in' })).toBeVisible();
    await capture(page, info, `revoked-${locale}.png`, `${locale.toUpperCase()} account after the actual signed HTTP receiver committed a departure and deleted the synthetic Discord session. Reload redirects to localized sign-in; the earlier session no longer authorizes account access.`);
  });

  test(`${locale}: an event cannot grant administrator authority during a Discord REST outage`, async ({ context, page, request }, info) => {
    const identity = await signInAs(context, { roles: ['member'], name: 'Synthetic role-sync member' });
    await page.goto(`/${locale}/account`);
    await expect(page.getByTestId('account-status')).toHaveAttribute('data-state', 'noAdmin');
    await setDiscordOutage(true, identity.discordUserId);
    await send(request, identity.discordUserId, [E2E_ROLE_IDS.member, E2E_ROLE_IDS.administrator], 'present');
    await page.reload();
    await expect(page.getByTestId('account-status')).toHaveAttribute('data-state', 'stale');
    await expect(page.getByTestId('account-open-admin')).toHaveCount(0);
    await expect(page.getByTestId('account-modules')).toHaveCount(0);
    await capture(page, info, `rest-outage-${locale}.png`, `${locale.toUpperCase()} account after a signed event advertised an administrator role, while simulated Discord REST is unavailable. The event only invalidated the cache; the localized stale-verification state grants no administration access.`);
    await page.goto(`/${locale}/admin`);
    await expect(page.getByTestId('access-denied')).toHaveAttribute('data-reason', 'stale_authorization');
  });
}
