import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { FIXTURE_MANUAL_SLUGS, FIXTURE_SLUGS } from '../src/fixtures/data';
import { serveSyntheticMedia } from './support/synthetic-video';

/**
 * Captioned screenshots of the unified platform and the HLL section for PR/issue
 * evidence. Opt-in only:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-hll.spec.ts
 * Output: <repo>/.local/evidence/hll/ (gitignored) + captures.json with captions. Data is
 * synthetic fixtures; the fullscreen HLL background uses the labelled browser-generated test pattern with
 * the first clip pinned (`Math.random` = 0) for a deterministic frame, or its poster.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture HLL platform screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/hll');
const captures: { file: string; caption: string; path: string; viewport: string; locale: string; fullPage: boolean }[] = [];

type Shot = {
  file: string;
  caption: string;
  locale: 'cs' | 'en';
  path: string;
  width: number;
  height: number;
  fullPage?: boolean;
  /** `playing`: synthetic clip plays; `poster`: reduced motion (no video request). */
  stage?: 'playing' | 'poster';
  expectStatus?: number;
  prepare?: (page: Page) => Promise<void>;
};

async function capture(browser: Browser, shot: Shot) {
  const mobile = shot.width < 768;
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: 1,
    reducedMotion: shot.stage === 'playing' ? 'no-preference' : 'reduce',
    locale: shot.locale === 'cs' ? 'cs-CZ' : 'en-GB',
    timezoneId: 'Europe/Prague',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await serveSyntheticMedia(page);
  const response = await page.goto(shot.path);
  expect(response?.status(), shot.path).toBe(shot.expectStatus ?? 200);
  await page.evaluate(() => document.fonts.ready);
  if (shot.stage === 'playing') {
    if (mobile) await page.locator('[data-hll-stage-toggle]').click();
    await expect(page.locator('[data-hll-stage-state]')).toHaveAttribute('data-hll-stage-state', 'playing', { timeout: 20_000 });
    await expect(page.locator('[data-hll-stage-state]')).toHaveAttribute('data-video-visible', '');
    await page.waitForTimeout(700);
  }
  await page.waitForLoadState('networkidle');
  if (shot.fullPage) {
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle');
  }
  await page.waitForFunction(() => [...document.images].filter((image) => image.getClientRects().length > 0).every((image) => image.complete));
  await shot.prepare?.(page);
  await page.screenshot({ path: path.join(outDir, shot.file), animations: 'disabled', caret: 'hide', fullPage: shot.fullPage ?? false });
  captures.push({ file: shot.file, caption: shot.caption, path: shot.path, viewport: `${shot.width}x${shot.height}`, locale: shot.locale, fullPage: shot.fullPage ?? false });
  await context.close();
}

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

const MANUAL = FIXTURE_MANUAL_SLUGS;
const SHOTS: Shot[] = [
  {
    file: 'hub-cs-1920x1200.png',
    caption: 'Community hub /cs: shared Valkyria identity, full-name game cards for Hell Let Loose and Wardogs, shared community sections and latest post; no game is marked current.',
    locale: 'cs',
    path: '/cs',
    width: 1920,
    height: 1200,
  },
  {
    file: 'hub-en-390x844.png',
    caption: 'Community hub /en on a 390×844 phone (full page): game cards stack, flags plus text labels in the language switch, no horizontal overflow.',
    locale: 'en',
    path: '/en',
    width: 390,
    height: 844,
    fullPage: true,
  },
  {
    file: 'hll-landing-cs-1920x1200.png',
    caption: 'HLL landing /cs/hll at 1920×1200 (compare reference 02): left menu lane with seven destinations, Discord CTA and utilities over the fullscreen background playing the labelled SYNTHETIC TEST CLIP (not clan footage); the lower-right strip shows the latest HLL post (the fixtures have no upcoming HLL match, so no match teaser is shown).',
    locale: 'cs',
    path: '/cs/hll',
    width: 1920,
    height: 1200,
    stage: 'playing',
  },
  {
    file: 'hll-landing-en-1920x1200.png',
    caption: 'HLL landing /en/hll at 1920×1200 under reduced motion: fullscreen background showing the labelled synthetic poster (no video request), English menu labels and Czech/UK flag language switch with text labels.',
    locale: 'en',
    path: '/en/hll',
    width: 1920,
    height: 1200,
    stage: 'poster',
  },
  {
    file: 'hll-landing-cs-1366x768.png',
    caption: 'HLL landing /cs/hll at a short 1366×768 viewport: the menu, CTA and utilities reflow without clipping over the fullscreen background playing the synthetic test clip.',
    locale: 'cs',
    path: '/cs/hll',
    width: 1366,
    height: 768,
    stage: 'playing',
  },
  {
    file: 'hll-landing-cs-390x844.png',
    caption: 'HLL landing /cs/hll on a 390×844 phone (full page): the viewport-filling background starts the compact synthetic rendition only after an explicit play press; navigation and footer controls remain in normal foreground document flow.',
    locale: 'cs',
    path: '/cs/hll',
    width: 390,
    height: 844,
    fullPage: true,
    stage: 'playing',
  },
  {
    file: 'hll-landing-cs-320x640.png',
    caption: 'HLL landing /cs/hll at 320 CSS px (full page, reduced motion): single-column reflow with no horizontal overflow and 44 px targets.',
    locale: 'cs',
    path: '/cs/hll',
    width: 320,
    height: 640,
    fullPage: true,
  },
  {
    file: 'hll-landing-focus-cs-1920x1200.png',
    caption: 'Keyboard focus on the HLL main menu (/cs/hll, reduced motion): visible focus outline around ZÁPASY over the fullscreen labelled synthetic poster; the explicit play control is in the utility footer.',
    locale: 'cs',
    path: '/cs/hll',
    width: 1920,
    height: 1200,
    prepare: async (page) => {
      await page.locator('[data-hll-menu="landing"] [data-hll-menu-item="matches"]').focus();
    },
  },
  {
    file: 'hll-mobile-menu-cs-390x844.png',
    caption: 'HLL content page /cs/hll/news on a phone with the labelled MENU drawer open: all sections, community link and the one shared sign-in.',
    locale: 'cs',
    path: '/cs/hll/news',
    width: 390,
    height: 844,
    prepare: async (page) => {
      await page.locator('[data-hll-masthead] button[aria-expanded]').first().click();
    },
  },
  {
    file: 'game-switch-notice-en-1366x768.png',
    caption: 'Game switch from /en/hll/field-manual to Wardogs (no field manual there): lands on /en/wardogs?switch=section with an explanatory notice; locale kept.',
    locale: 'en',
    path: '/en/wardogs?switch=section',
    width: 1366,
    height: 768,
  },
  {
    file: 'wardogs-home-cs-1920x1080.png',
    caption: 'Wardogs baseline /cs/wardogs: the original menu composition and background fallback preserved, with the added platform bar (community link + full-name game switch).',
    locale: 'cs',
    path: '/cs/wardogs',
    width: 1920,
    height: 1080,
  },
  {
    file: 'hll-news-cs-1920x1200.png',
    caption: 'HLL news /cs/hll/news: HLL posts plus explicitly labelled community posts, each linking to its canonical section; HLL theme and section bar with NOVINKY current.',
    locale: 'cs',
    path: '/cs/hll/news',
    width: 1920,
    height: 1200,
  },
  {
    file: 'hll-matches-results-cs-1920x1200.png',
    caption: 'HLL matches /cs/hll/matches?view=results: list/detail browser in the HLL theme with the synthetic historical HLL result (3 : 2).',
    locale: 'cs',
    path: '/cs/hll/matches?view=results',
    width: 1920,
    height: 1200,
  },
  {
    file: 'hll-members-cs-1366x768.png',
    caption: 'HLL members /cs/hll/members: only public profiles affiliated with Hell Let Loose (synthetic names).',
    locale: 'cs',
    path: '/cs/hll/members',
    width: 1366,
    height: 768,
  },
  {
    file: 'hll-servers-unselected-cs-1920x1200.png',
    caption: 'Servers /cs/hll/servers without a selection (reference 12): SYNTHETIC label, fresh/stale/unknown observations with times, missing values shown as dashes, honest “select a server” detail area.',
    locale: 'cs',
    path: '/cs/hll/servers',
    width: 1920,
    height: 1200,
  },
  {
    file: 'hll-servers-selected-cs-1920x1200.png',
    caption: 'Servers /cs/hll/servers?server=synthetic-bravo (reference 13): ~58:42 list/detail, selected row, stale observation and unknown player count stay explicit.',
    locale: 'cs',
    path: '/cs/hll/servers?server=synthetic-bravo',
    width: 1920,
    height: 1200,
  },
  {
    file: 'hll-servers-selected-en-390x844.png',
    caption: 'Servers detail on a phone (/en/hll/servers?server=synthetic-alpha, full page): list becomes a routable detail with a back link; copy-address control.',
    locale: 'en',
    path: '/en/hll/servers?server=synthetic-alpha',
    width: 390,
    height: 844,
    fullPage: true,
  },
  {
    file: 'manual-browse-cs-1920x1200.png',
    caption: 'Field manual /cs/hll/field-manual (compare reference 10): search rail with categories and counts beside category cards from published content only (draft-only categories hidden).',
    locale: 'cs',
    path: '/cs/hll/field-manual',
    width: 1920,
    height: 1200,
  },
  {
    file: 'manual-category-en-1366x768.png',
    caption: 'Field manual /en/hll/field-manual?category=communication: English category view; only published English articles are listed.',
    locale: 'en',
    path: '/en/hll/field-manual?category=communication',
    width: 1366,
    height: 768,
  },
  {
    file: 'manual-search-cs-1920x1200.png',
    caption: 'Field manual search /cs/hll/field-manual?q=sl: the abbreviation SL finds the synthetic squad-leader guide (synonym “velitel družstva”); query, result count and clear action in the rail.',
    locale: 'cs',
    path: '/cs/hll/field-manual?q=sl',
    width: 1920,
    height: 1200,
  },
  {
    file: 'manual-no-results-cs-390x844.png',
    caption: 'Field manual no-results state on a phone (/cs/hll/field-manual?q=soukromy koncept): a private draft is not searchable; calm message and clear-search action.',
    locale: 'cs',
    path: '/cs/hll/field-manual?q=soukromy%20koncept',
    width: 390,
    height: 844,
  },
  {
    file: 'manual-article-cs-1920x1200.png',
    caption: `Field manual article /cs/hll/field-manual/${MANUAL.setupCs} (full page): table of contents from body headings, cover, rich text and the provenance block (synthetic source, date, language, credits, review date).`,
    locale: 'cs',
    path: `/cs/hll/field-manual/${MANUAL.setupCs}`,
    width: 1920,
    height: 1200,
    fullPage: true,
  },
  {
    file: 'manual-article-cs-390x844.png',
    caption: `Field manual article on a phone (/cs/hll/field-manual/${MANUAL.squadLeaderCs}, full page): contents list above the text, no horizontal overflow.`,
    locale: 'cs',
    path: `/cs/hll/field-manual/${MANUAL.squadLeaderCs}`,
    width: 390,
    height: 844,
    fullPage: true,
  },
  {
    file: 'manual-missing-translation-en-1366x768.png',
    caption: `Language switch from the Czech-only guide ${MANUAL.tankCs}: /en/hll/field-manual shows a notice with a safe link to the published Czech article instead of a draft or a guessed slug.`,
    locale: 'en',
    path: `/en/hll/field-manual?missing=cs:${MANUAL.tankCs}`,
    width: 1366,
    height: 768,
  },
  {
    file: 'hll-match-detail-cs-1366x768.png',
    caption: `HLL match detail /cs/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical}: selected row and detail pane in the HLL theme; synthetic opponent.`,
    locale: 'cs',
    path: `/cs/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical}`,
    width: 1366,
    height: 768,
  },
  {
    file: 'hll-match-statistics-cs-1440x900.png',
    caption: `HLL match detail /cs/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical} at 1440×900 (full page): rounds with map, Warfare mode and Spojenci side, then the imported game statistics (source, game ID, import time) with the Souhrn tab: team totals and kills by weapon type. Synthetic scoreboard and player names.`,
    locale: 'cs',
    path: `/cs/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical}`,
    width: 1440,
    height: 900,
    fullPage: true,
  },
  {
    file: 'hll-match-statistics-players-en-390x844.png',
    caption: 'The same statistics in English on a 390×844 phone with the Players tab: published synthetic player rows in a horizontally scrollable table (visible only because an editor published them).',
    locale: 'en',
    path: `/en/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical}`,
    width: 390,
    height: 844,
    prepare: async (page) => {
      const statistics = page.locator('[data-match-statistics]');
      await statistics.getByRole('tab', { name: 'Players' }).click();
      await statistics.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -60));
    },
  },
];

for (const shot of SHOTS) {
  test(shot.file, async ({ browser }) => {
    await capture(browser, shot);
  });
}
