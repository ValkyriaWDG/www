import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';
import { settledBackgroundState, tabUntil } from './support/shell-helpers';

/**
 * Deterministic public-page screenshots for PR/issue evidence. Opt-in only:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-public.spec.ts
 * Output: <repo>/.local/evidence/public/ (gitignored) plus captures.json with captions.
 * Synthetic fixtures only; the missing e2e video leaves the original fallback scene.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture public page screenshots.');

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/public');
const captures: { file: string; caption: string; path: string; viewport: string; locale: string; fullPage: boolean }[] = [];

type Shot = {
  file: string;
  caption: string;
  locale: 'cs' | 'en';
  path: string;
  width: number;
  height: number;
  fullPage?: boolean;
  prepare?: (page: Page) => Promise<void>;
};

async function capture(browser: Browser, shot: Shot) {
  const mobile = shot.width < 768;
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    locale: shot.locale === 'cs' ? 'cs-CZ' : 'en-GB',
  });
  const page = await context.newPage();
  const response = await page.goto(shot.path);
  expect(response?.status(), shot.path).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  await settledBackgroundState(page);
  await page.waitForLoadState('networkidle');
  if (shot.fullPage) {
    // Scroll once so lazily loaded images below the fold are fetched before the full-page capture.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle');
    // Only rendered images (the shell's hidden lazy emblem never loads on subpages).
    await page.waitForFunction(() => [...document.images].filter((image) => image.getClientRects().length > 0).every((image) => image.complete));
  }
  await shot.prepare?.(page);
  await page.screenshot({ path: path.join(outDir, shot.file), animations: 'disabled', caret: 'hide', fullPage: shot.fullPage ?? false });
  captures.push({ file: shot.file, caption: shot.caption, path: shot.path, viewport: `${shot.width}x${shot.height}`, locale: shot.locale, fullPage: shot.fullPage ?? false });
  await context.close();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

const NEWS = FIXTURE_SLUGS.news;
const MATCHES = FIXTURE_SLUGS.matches;
const MEMBERS = FIXTURE_SLUGS.members;

const SHOTS: Shot[] = [];

for (const locale of ['cs', 'en'] as const) {
  for (const [width, height] of [
    [1920, 1080],
    [390, 844],
  ] as const) {
    SHOTS.push({
      file: `news-list-${locale}-${width}x${height}.png`,
      caption: `News list /${locale}/news at ${width}×${height}: image panels with covers or neutral placeholders, category/game eyebrow, localized dates, filters and result count${width < 768 ? ' (single column)' : ''}.`,
      locale,
      path: `/${locale}/news`,
      width,
      height,
    });
    const slug = locale === 'cs' ? NEWS.longFormCs : NEWS.longFormEn;
    SHOTS.push({
      file: `news-article-long-${locale}-${width}x${height}.png`,
      caption: `Long-form article /${locale}/news/${slug} at ${width}×${height} (full page): back link, publication date/author, cover with caption, readable body in the dark editorial frame, related posts.`,
      locale,
      path: `/${locale}/news/${slug}`,
      width,
      height,
      fullPage: true,
    });
  }
}

SHOTS.push({
  file: 'news-article-feature-cs-1920x1080.png',
  caption: 'Feature article (cs, full page): inline wide image with caption, table in a labelled scroll region, external link indicator, related posts.',
  locale: 'cs',
  path: `/cs/news/${NEWS.featureCs}`,
  width: 1920,
  height: 1080,
  fullPage: true,
});

for (const locale of ['cs', 'en'] as const) {
  SHOTS.push({
    file: `matches-results-${locale}-1920x1080.png`,
    caption: `Match browser /${locale}/matches?view=results (reference 13): tabs + search/game toolbar, ~2/3 list with date/zone, competition tags, status badges, tabular scores and a dash for the unpublished result; detail preview pane with MATCH DETAILS action.`,
    locale,
    path: `/${locale}/matches?view=results`,
    width: 1920,
    height: 1080,
  });
  SHOTS.push({
    file: `matches-detail-${locale}-1920x1080.png`,
    caption: `Canonical match detail /${locale}/matches/${MATCHES.completedVerified} on desktop: same results list with the row selected (amber outline) and the full detail pane (verified 2 : 1 result, recap, rounds, links).`,
    locale,
    path: `/${locale}/matches/${MATCHES.completedVerified}`,
    width: 1920,
    height: 1080,
    fullPage: true,
  });
}

SHOTS.push({
  file: 'matches-upcoming-cs-1920x1080.png',
  caption: 'Upcoming fixtures (cs): scheduled and postponed rows (postponed shows the original date), no result column, preview of the next fixture.',
  locale: 'cs',
  path: '/cs/matches',
  width: 1920,
  height: 1080,
});
SHOTS.push({
  file: 'matches-list-cs-390x844.png',
  caption: 'Match list on a phone (cs, 390×844, full page): compact row summaries (date + status, teams, competition + result); no preview pane.',
  locale: 'cs',
  path: '/cs/matches?view=results',
  width: 390,
  height: 844,
  fullPage: true,
});
SHOTS.push({
  file: 'matches-detail-cs-390x844.png',
  caption: `Standalone match detail on a phone (cs, 390×844, full page) /cs/matches/${MATCHES.completedUnknown}: back link, unpublished result shown as a dash with an explanation (never 0:0), published Czech recap.`,
  locale: 'cs',
  path: `/cs/matches/${MATCHES.completedUnknown}`,
  width: 390,
  height: 844,
  fullPage: true,
});
SHOTS.push({
  file: 'matches-row-focus-cs-1920x1080.png',
  caption: 'Keyboard focus on a match row link: pale focus ring around the whole row, distinct from the amber selection.',
  locale: 'cs',
  path: '/cs/matches?view=results',
  width: 1920,
  height: 1080,
  prepare: async (page) => {
    await tabUntil(page, '[data-match-table] tbody a', 80);
  },
});

SHOTS.push({
  file: 'members-list-cs-1920x1080.png',
  caption: 'Member roster /cs/members (reference 12): emblem title block with the real profile count, zebra rows, avatars or initials, localized public roles and game tags; long name clamped to two lines, emoji name as stored.',
  locale: 'cs',
  path: '/cs/members',
  width: 1920,
  height: 1080,
});
SHOTS.push({
  file: 'members-profile-cs-1920x1080.png',
  caption: `Member profile /cs/members/${MEMBERS.publishedCsOnlyBio}: initials avatar, public roles, games and the published Czech biography.`,
  locale: 'cs',
  path: `/cs/members/${MEMBERS.publishedCsOnlyBio}`,
  width: 1920,
  height: 1080,
});
SHOTS.push({
  file: 'members-list-en-390x844.png',
  caption: 'Member roster on a phone (en, 390×844, full page): compact rows with avatar/initials, name (max two lines), role and game tags.',
  locale: 'en',
  path: '/en/members',
  width: 390,
  height: 844,
  fullPage: true,
});
SHOTS.push({
  file: 'members-profile-en-390x844.png',
  caption: `Member profile on a phone (en) /en/members/${MEMBERS.publishedCsOnlyBio}: the English biography is not published, so an explicit absence notice links to the Czech biography.`,
  locale: 'en',
  path: `/en/members/${MEMBERS.publishedCsOnlyBio}`,
  width: 390,
  height: 844,
  fullPage: true,
});

for (const locale of ['cs', 'en'] as const) {
  SHOTS.push({
    file: `clan-${locale}-1440x900.png`,
    caption: `Clan page /${locale}/clan at 1440×900 (full page): published story in a readable frame, Discord CTA, contextual Hell Let Loose website link (external), next-step links.`,
    locale,
    path: `/${locale}/clan`,
    width: 1440,
    height: 900,
    fullPage: true,
  });
}
SHOTS.push({
  file: 'community-cs-1440x900.png',
  caption: 'Community page /cs/community (reference 11, full page): two large square choices DISCORD / JAK SE PŘIDAT, Discord-vs-sign-in explanation, community guide and HLL website block.',
  locale: 'cs',
  path: '/cs/community',
  width: 1440,
  height: 900,
  fullPage: true,
});
SHOTS.push({
  file: 'news-missing-translation-en-1440x900.png',
  caption: `Missing translation: switching /cs/news/${NEWS.csOnly} to English lands on /en/news with a localized notice and an explicit hreflang=cs link to the published Czech article.`,
  locale: 'en',
  path: `/en/news?missing=cs:${NEWS.csOnly}`,
  width: 1440,
  height: 900,
});
SHOTS.push({
  file: 'privacy-en-1440x900.png',
  caption: 'Privacy page /en/privacy (full page): published English copy in the reading frame.',
  locale: 'en',
  path: '/en/privacy',
  width: 1440,
  height: 900,
  fullPage: true,
});

for (const shot of SHOTS) {
  test(shot.file, async ({ browser }) => {
    await capture(browser, shot);
  });
}
