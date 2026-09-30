import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { settledBackgroundState, tabUntil } from './support/shell-helpers';

/**
 * Deterministic shell screenshots for PR/issue evidence. Opt-in only:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual.spec.ts
 * Output: <repo>/.local/evidence/shell/ (gitignored) plus captures.json with captions.
 * Fonts are awaited, animations disabled; the missing e2e video leaves the original
 * fallback scene, so frames do not depend on media timing.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture shell screenshots.');

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/shell');
const captures: { file: string; caption: string; viewport: string; locale: string; backgroundState: string | null }[] = [];

type Shot = {
  file: string;
  caption: string;
  locale: 'cs' | 'en';
  width: number;
  height: number;
  path?: string;
  reducedMotion?: boolean;
  mobile?: boolean;
  prepare?: (page: Page) => Promise<void>;
};

async function capture(browser: Browser, shot: Shot) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    reducedMotion: shot.reducedMotion ? 'reduce' : 'no-preference',
    hasTouch: shot.mobile ?? false,
    isMobile: shot.mobile ?? false,
    deviceScaleFactor: 1,
    locale: shot.locale === 'cs' ? 'cs-CZ' : 'en-GB',
  });
  const page = await context.newPage();
  await page.goto(shot.path ?? `/${shot.locale}`);
  await page.evaluate(() => document.fonts.ready);
  const backgroundState = await settledBackgroundState(page);
  await shot.prepare?.(page);
  await page.screenshot({ path: path.join(outDir, shot.file), animations: 'disabled', caret: 'hide' });
  captures.push({ file: shot.file, caption: shot.caption, viewport: `${shot.width}x${shot.height}`, locale: shot.locale, backgroundState });
  await context.close();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

const HOME_SIZES = [
  [2560, 1440, 'reference-09 canvas'],
  [1920, 1080, 'desktop baseline'],
  [1440, 900, '16:10 laptop'],
  [2560, 1080, 'ultrawide crop'],
  [390, 844, 'phone, poster-first'],
  [320, 568, 'smallest phone'],
] as const;

for (const locale of ['cs', 'en'] as const) {
  for (const [width, height, note] of HOME_SIZES) {
    test(`home ${locale} ${width}x${height}`, async ({ browser }) => {
      await capture(browser, {
        file: `home-${locale}-${width}x${height}.png`,
        caption: `Home /${locale} at ${width}×${height} (${note}); missing e2e video → original fallback scene.`,
        locale,
        width,
        height,
        mobile: width < 768,
      });
    });
  }
}

test('home reduced motion', async ({ browser }) => {
  await capture(browser, {
    file: 'home-cs-1920x1080-reduced-motion.png',
    caption: 'Home /cs with prefers-reduced-motion: poster/fallback only, no video request, Play background control offered.',
    locale: 'cs',
    width: 1920,
    height: 1080,
    reducedMotion: true,
  });
});

test('keyboard focus on a navigation item', async ({ browser }) => {
  await capture(browser, {
    file: 'focus-nav-cs-1920x1080.png',
    caption: 'Keyboard focus on NOVINKY (pale inset ring) next to the amber current HLAVNÍ MENU item.',
    locale: 'cs',
    width: 1920,
    height: 1080,
    prepare: async (page) => {
      await tabUntil(page, '[data-nav="desktop"] [data-nav-item="news"]');
      await expect(page.locator('[data-nav="desktop"] [data-nav-item="news"]')).toBeFocused();
    },
  });
});

test('keyboard focus on the primary CTA', async ({ browser }) => {
  await capture(browser, {
    file: 'focus-cta-cs-1920x1080.png',
    caption: 'Keyboard focus on the Discord CTA (outer pale ring outside the amber outline).',
    locale: 'cs',
    width: 1920,
    height: 1080,
    prepare: async (page) => {
      await tabUntil(page, '[data-cta="discord"]');
    },
  });
});

test('keyboard focus on a utility button with tooltip', async ({ browser }) => {
  await capture(browser, {
    file: 'focus-utility-en-1920x1080.png',
    caption: 'Keyboard focus on the News utility button showing its tooltip (en).',
    locale: 'en',
    width: 1920,
    height: 1080,
    prepare: async (page) => {
      await tabUntil(page, '[data-utility="news"]');
    },
  });
});

for (const [width, height, note] of [
  [768, 1024, 'tablet: icon-only account, full Czech nav labels'],
  [1024, 768, 'condensed header: flag + code language control'],
] as const) {
  test(`header breakpoint ${width}x${height}`, async ({ browser }) => {
    await capture(browser, {
      file: `home-cs-${width}x${height}.png`,
      caption: `Home /cs at ${width}×${height} (${note}).`,
      locale: 'cs',
      width,
      height,
    });
  });
}

test('mobile menu open', async ({ browser }) => {
  await capture(browser, {
    file: 'mobile-menu-cs-390x844.png',
    caption: 'Mobile disclosure menu open (cs, 390×844): all sections incl. NOVINKY and sign-in; flag switcher in the compact header.',
    locale: 'cs',
    width: 390,
    height: 844,
    mobile: true,
    prepare: async (page) => {
      await page.locator('[data-mobile-menu-trigger]').click();
      await expect(page.locator('[data-mobile-menu-panel]')).toBeVisible();
    },
  });
});

test('public subpage treatment', async ({ browser }) => {
  await capture(browser, {
    file: 'subpage-not-found-en-1440x900.png',
    caption: 'Localized not-found page inside the shell (en): darker public scrim, no crest, footer strip with Privacy.',
    locale: 'en',
    width: 1440,
    height: 900,
    path: '/en/this-page-does-not-exist',
  });
});
