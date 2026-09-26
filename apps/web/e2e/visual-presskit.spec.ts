import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, test } from '@playwright/test';

/**
 * Presskit placement screenshots for PR/issue evidence. Opt-in only:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-presskit.spec.ts
 * Output: <repo>/.local/evidence/presskit/ (gitignored) plus captures.json with captions.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture presskit screenshots.');

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/presskit');
const captures: { file: string; caption: string; viewport: string; path: string }[] = [];

type Shot = { file: string; caption: string; path: string; width: number; height: number; mobile?: boolean; focus?: string };

async function capture(browser: Browser, shot: Shot) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    reducedMotion: 'reduce',
    hasTouch: shot.mobile ?? false,
    isMobile: shot.mobile ?? false,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(shot.path);
  await page.evaluate(() => document.fonts.ready);
  if (shot.focus) {
    const image = page.locator(shot.focus).first().locator('img');
    await image.evaluate(async (img: HTMLImageElement) => {
      img.scrollIntoView({ block: 'center' });
      await img.decode();
    });
  }
  await page.screenshot({ path: path.join(outDir, shot.file), animations: 'disabled', caret: 'hide' });
  captures.push({ file: shot.file, caption: shot.caption, viewport: `${shot.width}x${shot.height}`, path: shot.path });
  await context.close();
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => mkdirSync(outDir, { recursive: true }));
test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

test('clan key art (cs desktop, en phone)', async ({ browser }) => {
  await capture(browser, {
    file: 'clan-key-art-cs-1440x900.png',
    caption: '/cs/clan at 1440×900: Wardogs key art above the clan story, complete composition with its wordmark (object-fit: contain in a 16:9 frame), captioned as the game’s press-kit art that does not show a Valkyria event.',
    path: '/cs/clan',
    width: 1440,
    height: 900,
    focus: '[data-presskit="key-art-1080p"]',
  });
  await capture(browser, {
    file: 'clan-key-art-en-390x844.png',
    caption: '/en/clan on a 390×844 phone: the same key art at full width with the complete wordmark and the English caption; no horizontal overflow.',
    path: '/en/clan',
    width: 390,
    height: 844,
    mobile: true,
    focus: '[data-presskit="key-art-1080p"]',
  });
});

test('community recruitment illustration (en desktop, cs phone)', async ({ browser }) => {
  await capture(browser, {
    file: 'community-flying-en-1440x900.png',
    caption: '/en/community at 1440×900: the Flying scene (helicopter over the valley) below the DISCORD / HOW TO JOIN choices, full 16:9 frame, captioned as illustrative game media.',
    path: '/en/community',
    width: 1440,
    height: 900,
    focus: '[data-presskit="flying"]',
  });
  await capture(browser, {
    file: 'community-flying-cs-390x844.png',
    caption: '/cs/community on a 390×844 phone: the complete Flying frame with the Czech caption.',
    path: '/cs/community',
    width: 390,
    height: 844,
    mobile: true,
    focus: '[data-presskit="flying"]',
  });
});

test('news cards identify Wardogs with the unchanged wordmark (cs)', async ({ browser }) => {
  await capture(browser, {
    file: 'news-wardogs-mark-cs-1440x900.png',
    caption: '/cs/news at 1440×900: synthetic Wardogs posts without a cover show the unchanged white Wardogs wordmark in the neutral placeholder (decorative; the card eyebrow names the game).',
    path: '/cs/news?game=wardogs',
    width: 1440,
    height: 900,
    focus: '[data-placeholder-game="wardogs"]',
  });
});
