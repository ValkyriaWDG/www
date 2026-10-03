import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type Page, test } from '@playwright/test';
import { type E2ERole, signInAs } from './support/auth';

/**
 * Sign-in, account and denial screenshots for PR/issue evidence. Opt-in only:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-auth.spec.ts
 * Output: <repo>/.local/evidence/auth/ (gitignored) plus captures.json with captions.
 * Identities are synthetic sessions against the local Discord mock; nothing is live.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture auth screenshots.');

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/auth');
const captures: { file: string; caption: string; viewport: string; path: string }[] = [];

type Shot = { file: string; caption: string; path: string; width: number; height: number; mobile?: boolean; role?: E2ERole; fullPage?: boolean };

async function capture(browser: Browser, shot: Shot, prepare?: (page: Page) => Promise<void>) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    reducedMotion: 'reduce',
    hasTouch: shot.mobile ?? false,
    isMobile: shot.mobile ?? false,
    deviceScaleFactor: 1,
  });
  if (shot.role) await signInAs(context, { roles: [shot.role], name: `Synthetic ${shot.role}` });
  const page = await context.newPage();
  await page.goto(shot.path);
  await page.evaluate(() => document.fonts.ready);
  await prepare?.(page);
  await page.screenshot({ path: path.join(outDir, shot.file), animations: 'disabled', caret: 'hide', fullPage: shot.fullPage ?? false });
  captures.push({ file: shot.file, caption: shot.caption, viewport: `${shot.width}x${shot.height}`, path: shot.path });
  await context.close();
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => mkdirSync(outDir, { recursive: true }));
test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

test('sign-in (cs desktop, en phone)', async ({ browser }) => {
  await capture(browser, {
    file: 'login-cs-1440x900.png',
    caption: 'Anonymous visitor, /cs/login: Logi stays visible with a disabled action and an explicit unavailable explanation. The synthetic configured Discord sign-in remains available; signing in does not grant administrative roles.',
    path: '/cs/login',
    width: 1440,
    height: 900,
  });
  await capture(browser, {
    file: 'login-en-390x844.png',
    caption: 'Anonymous visitor, /en/login on a 390×844 phone: unavailable Logi and the synthetic configured Discord sign-in in English, with the language switcher and menu trigger in the header.',
    path: '/en/login',
    width: 390,
    height: 844,
    mobile: true,
    fullPage: true,
  });
});

test('recovery sign-in when local administrator login is disabled (cs)', async ({ browser }) => {
  await capture(browser, {
    file: 'login-recovery-cs-1440x900.png',
    caption: '/cs/login/recovery with LOCAL_ADMIN_LOGIN_ENABLED unset (the e2e default): the local administrator recovery route answers with the localized 404 page, so no password form is exposed.',
    path: '/cs/login/recovery',
    width: 1440,
    height: 900,
  });
});

test('signed-in member account and security (cs)', async ({ browser }) => {
  await capture(browser, {
    file: 'account-member-cs-1440x900.png',
    caption: 'Synthetic Discord member, /cs/account: signed-in name and method (Discord), access status “Nemáte přístup do administrace” derived from guild roles, “Obnovit členství” and sign-out.',
    path: '/cs/account',
    width: 1440,
    height: 900,
    role: 'member',
    fullPage: true,
  });
});

test('member denied in administration (en)', async ({ browser }) => {
  await capture(browser, {
    file: 'admin-denied-member-en-1440x900.png',
    caption: 'Synthetic Discord member without editorial roles, /en/admin: the administration renders the localized denial panel (HTTP 403 semantics) instead of any module.',
    path: '/en/admin',
    width: 1440,
    height: 900,
    role: 'member',
  });
});
