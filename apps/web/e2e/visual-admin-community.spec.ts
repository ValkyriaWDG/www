import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { matchBySlug, memberBySlug } from './admin-community-support';
import { type E2ERole, signInAs } from './support/auth';

/**
 * Captioned screenshots of the community administration for PR/issue evidence. Opt-in:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-admin-community.spec.ts
 * Output: <worktree>/.local/evidence/admin-community/ (gitignored) plus captions.json.
 * Data comes from the synthetic e2e fixtures; nothing here is real clan data.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture community administration screenshots.');

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/admin-community');
const captions: { file: string; caption: string; viewport: string; locale: string; role: string; path: string }[] = [];

type Shot = {
  file: string;
  caption: string;
  locale: 'cs' | 'en';
  role: E2ERole;
  width?: number;
  height?: number;
  fullPage?: boolean;
  /** Capture only this element (e.g. one form group) instead of the viewport. */
  element?: string;
  open: (page: Page) => Promise<string>;
  prepare?: (page: Page) => Promise<void>;
};

async function newContext(browser: Browser, shot: Shot): Promise<BrowserContext> {
  const mobile = (shot.width ?? 1920) < 768;
  return browser.newContext({
    viewport: { width: shot.width ?? 1920, height: shot.height ?? 1080 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: shot.locale === 'cs' ? 'cs-CZ' : 'en-GB',
    reducedMotion: 'reduce',
  });
}

async function capture(browser: Browser, shot: Shot) {
  const context = await newContext(browser, shot);
  await signInAs(context, { roles: [shot.role], name: shot.role === 'administrator' ? 'Syntetický administrátor' : shot.role === 'editor' ? 'Syntetický editor' : 'Syntetický správce zápasů' });
  const page = await context.newPage();
  const target = await shot.open(page);
  await page.goto(target);
  await page.evaluate(() => document.fonts.ready);
  await shot.prepare?.(page);
  // Horizontal overflow would be a layout defect at any viewport.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  // Full-page captures: end scrolled to the bottom so the sticky save bar sits at its natural place.
  if (shot.fullPage) await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  if (shot.element) await page.locator(shot.element).screenshot({ path: path.join(outDir, shot.file), animations: 'disabled', caret: 'hide' });
  else await page.screenshot({ path: path.join(outDir, shot.file), fullPage: shot.fullPage ?? false, animations: 'disabled', caret: 'hide' });
  captions.push({ file: shot.file, caption: shot.caption, viewport: `${shot.width ?? 1920}x${shot.height ?? 1080}`, locale: shot.locale, role: shot.role, path: target });
  await context.close();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captions.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures: captions }, null, 2)}\n`);
});

test('matches admin list (cs)', async ({ browser }) => {
  await capture(browser, {
    file: 'matches-list-cs-1920x1080.png',
    caption: 'Match manager, /cs/admin/matches at 1920×1080: prominent NOVÝ ZÁPAS, search + game/status/publication filters in the URL, date range, start times in Europe/Prague with zone, separate status and publication badges, results or “—”.',
    locale: 'cs',
    role: 'match_manager',
    open: async () => '/cs/admin/matches',
  });
});

test('new match form with explicit time zone and validation errors (cs)', async ({ browser }) => {
  await capture(browser, {
    file: 'match-new-validation-cs-1920x1080.png',
    caption: 'New match form (cs) after “Uložit koncept” with a missing opponent name and an invalid best-of: inline, associated field errors; schedule entered as 19:30 in Europe/London with the resolved instant shown in London, Prague and UTC.',
    locale: 'cs',
    role: 'match_manager',
    fullPage: true,
    open: async () => '/cs/admin/matches/new',
    prepare: async (page) => {
      await page.getByLabel(/^Na počet vítězství/).fill('x');
      await page.getByLabel(/^Datum začátku/).fill('2026-11-14');
      await page.getByLabel(/^Čas začátku/).fill('19:30');
      await page.getByLabel(/^Časové pásmo/).selectOption('Europe/London');
      await page.locator('[data-action="save"]').click();
      await expect(page.getByText('Vyplňte toto pole.')).toBeVisible();
    },
  });
});

test('result entry with rounds (en)', async ({ browser }) => {
  await capture(browser, {
    file: 'match-result-rounds-en-1920x1080.png',
    caption: 'Result group of the completed synthetic fixture (en, 1920×1080 page, element capture): verified 2 : 1 result with derived outcome, provisional/verified choice, source, three rounds in compact rows with Up/Down/Remove buttons (no drag-only interaction) and a fourth round being added before “Update result”.',
    locale: 'en',
    role: 'match_manager',
    element: '[data-group="result"]',
    open: async () => `/en/admin/matches/${(await matchBySlug('ukazka-wardogs-overeny-vysledek'))!.id}`,
    prepare: async (page) => {
      await page.locator('[data-round-add]').click();
      await page.locator('[data-round-index="3"]').getByLabel(/^Map/).fill('Synthetic Map D');
      // Element capture: keep the sticky save bar from overlapping the captured group.
      await page.locator('[data-sticky-actions]').evaluate((element) => ((element as HTMLElement).style.position = 'static'));
    },
  });
});

test('member form with consent confirmation (cs)', async ({ browser }) => {
  await capture(browser, {
    file: 'member-consent-cs-1920x1080.png',
    caption: 'Editor on the draft synthetic member profile (cs): consent missing, explicit confirmation checkbox ticked before “Zaznamenat souhlas”, publish refused until consent, and the “Co bude veřejné” preview limited to public fields.',
    locale: 'cs',
    role: 'editor',
    open: async () => `/cs/admin/members/${(await memberBySlug('synteticky-hrac-charlie'))!.id}`,
    prepare: async (page) => {
      await page.locator('[data-consent-form] input[type="checkbox"]').check();
    },
  });
});

test('settings with background preview (cs)', async ({ browser }) => {
  await capture(browser, {
    file: 'settings-preview-cs-1920x1080.png',
    caption: 'Administrator, /cs/admin/settings: unsaved custom background (same-site poster, focal point 30 %/40 %, provenance) in the labelled NÁHLED frame with the fallback scene behind it; live values shown separately; “Uložit nastavení” states it goes live immediately.',
    locale: 'cs',
    role: 'administrator',
    fullPage: true,
    open: async () => '/cs/admin/settings',
    prepare: async (page) => {
      await page.getByLabel('Vlastní nastavení').check();
      await page.getByLabel(/^Adresa obrázku/).fill('/brand/valkyria-emblem-733.webp');
      await page.getByLabel(/^Ohnisko X/).fill('30');
      await page.getByLabel(/^Ohnisko Y/).fill('40');
      await page.getByLabel(/^Původ a práva/).fill('Syntetický testovací obrázek (znak klanu z repozitáře), jen pro náhled.');
      await expect(page.locator('[data-preview-status="ready"]')).toBeVisible();
    },
  });
});

test('audit table with detail (en)', async ({ browser }) => {
  await capture(browser, {
    file: 'audit-en-1920x1080.png',
    caption: 'Administrator, /en/admin/audit: redacted, paginated audit table (time in Europe/Prague, actor label and kind, action, capability, entity, language, outcome) with bounded filters and the selected event’s key/value summary.',
    locale: 'en',
    role: 'administrator',
    open: async () => '/en/admin/audit',
    prepare: async (page) => {
      await page.locator('[data-admin-audit] tbody tr a').first().click();
      await expect(page.locator('[data-audit-summary], #audit-detail-title')).not.toHaveCount(0);
    },
  });
});

test('denied page for an editor (cs)', async ({ browser }) => {
  await capture(browser, {
    file: 'denied-editor-cs-1920x1080.png',
    caption: 'Editor opening /cs/admin/matches: server-enforced localized access denial (editors cannot manage matches); no match data rendered.',
    locale: 'cs',
    role: 'editor',
    open: async () => '/cs/admin/matches',
  });
});

test('match form on a phone (cs, 390×844)', async ({ browser }) => {
  await capture(browser, {
    file: 'match-form-cs-390x844.png',
    caption: 'Existing upcoming synthetic match at 390×844 (cs): status panel first, stacked single-column groups, no horizontal scrolling; full-page capture.',
    locale: 'cs',
    role: 'match_manager',
    width: 390,
    height: 844,
    fullPage: true,
    open: async () => `/cs/admin/matches/${(await matchBySlug('ukazka-wardogs-nadchazejici'))!.id}`,
  });
});
