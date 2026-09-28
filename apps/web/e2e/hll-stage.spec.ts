import { expect, type Page, test } from '@playwright/test';
import { requestedClipIds, serveSyntheticMedia, SYNTHETIC_CLIP_IDS } from './support/synthetic-video';

/**
 * HLL cinematic stage lifecycle with two labelled synthetic clips (browser-generated test
 * pattern; see e2e/support/synthetic-video.ts). Network assertions prove what is fetched:
 * nothing under reduced motion, Save-Data or the narrow touch default; one selected clip
 * per document; no reroll across internal navigation, language switches or history; one
 * alternate rendition after a failure. Real HLL footage acceptance is a separate gate.
 */

const stage = (page: Page) => page.locator('[data-hll-stage-state]');

async function selectedClip(page: Page): Promise<string> {
  await expect(stage(page)).not.toHaveAttribute('data-hll-clip', '');
  return (await stage(page).getAttribute('data-hll-clip'))!;
}

test('plays exactly one clip from the enabled set and keeps it across navigation, language and history', async ({ page }) => {
  const log = await serveSyntheticMedia(page);
  await page.goto('/cs/hll');
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'playing', { timeout: 15_000 });
  const clip = await selectedClip(page);
  expect(SYNTHETIC_CLIP_IDS).toContain(clip);
  expect(requestedClipIds(log)).toEqual([clip]);
  expect(log.video.every((path) => path.endsWith('-desktop.webm'))).toBe(true);
  await expect(page.locator('video')).toHaveCount(1);

  // The persistent background keeps the same element/time, paused behind content.
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.dataset.identity = 'persistent-hll'; });
  await page.locator('[data-hll-menu="landing"] [data-hll-menu-item="news"]').click();
  await expect(page).toHaveURL(/\/cs\/hll\/news$/);
  await expect(page.locator('video')).toHaveCount(1);
  await expect(page.locator('video')).toHaveAttribute('data-identity', 'persistent-hll');
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'paused');
  await expect(stage(page)).toHaveAttribute('data-hll-stage-reason', 'route');
  expect(await selectedClip(page)).toBe(clip);
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  const pausedAt = await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime);
  await page.waitForTimeout(350);
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(pausedAt);
  await page.locator('[data-hll-identity]').click();
  await expect(page).toHaveURL(/\/cs\/hll$/);
  expect(await selectedClip(page)).toBe(clip);
  await expect(page.locator('video')).toHaveAttribute('data-identity', 'persistent-hll');
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'playing');

  // Language switch (a new document) hands the selection over.
  await page.getByRole('link', { name: 'Přepnout na angličtinu (English)' }).first().click();
  await expect(page).toHaveURL(/\/en\/hll$/);
  expect(await selectedClip(page)).toBe(clip);

  // History traversal back to the Czech document keeps it too.
  await page.goBack();
  await expect(page).toHaveURL(/\/cs\/hll$/);
  expect(await selectedClip(page)).toBe(clip);
  expect(requestedClipIds(log)).toEqual([clip]);

  // The Wardogs section never starts a second stage decoder.
  await page.locator('[data-game-switch] [data-game-option="wardogs"]').first().click();
  await expect(page).toHaveURL(/\/cs\/wardogs$/);
  await expect(page.locator('[data-hll-stage-video]')).toHaveCount(0);
});

test('background covers the viewport on desktop and mobile without a central media box', async ({ page }) => {
  await serveSyntheticMedia(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 1920, height: 1200 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/cs/hll');
    await selectedClip(page);
    const visibleViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: window.innerHeight }));
    for (const selector of ['[data-hll-scene]', '[data-hll-default-poster]', '[data-hll-stage-poster]']) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds, selector).toEqual({ x: 0, y: 0, ...visibleViewport });
    }
    await expect(page.locator('[data-hll-scene]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-hll-scene] button')).toHaveCount(0);
    await expect(page.locator('[data-hll-footer] [data-hll-stage-toggle]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('a direct content page keeps a static poster and never attaches a video source', async ({ page }) => {
  const log = await serveSyntheticMedia(page);
  await page.goto('/cs/hll/news');
  await selectedClip(page);
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'paused');
  await expect(stage(page)).toHaveAttribute('data-hll-stage-reason', 'route');
  await expect(page.locator('[data-hll-stage-toggle]')).toBeDisabled();
  await expect(page.locator('[data-hll-stage-video]')).not.toHaveAttribute('src');
  await page.waitForTimeout(500);
  expect(log.video).toEqual([]);
  expect(log.poster.length).toBeGreaterThan(0);
});

test('a configured poster returning 404 reveals the default HLL poster without requesting video', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const log = await serveSyntheticMedia(page);
  await page.route('**/e2e-media/*.png', (route) => route.fulfill({ status: 404, body: '' }));
  const missingPoster = page.waitForResponse((response) => response.url().includes('/e2e-media/') && response.url().endsWith('.png') && response.status() === 404);
  await page.goto('/cs/hll');
  const clip = await selectedClip(page);
  await missingPoster;
  await expect(page.locator('[data-hll-stage-poster]')).toHaveCount(0);
  const fallback = page.locator('[data-hll-default-poster]');
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute('src', '/images/hll/scene-poster.webp');
  await expect.poll(() => fallback.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(stage(page)).toHaveAttribute('data-hll-clip', clip);
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'paused');
  await expect(page.locator('[data-hll-stage-video]')).not.toHaveAttribute('src');
  expect(log.video).toEqual([]);
  await expect(page.getByRole('navigation', { name: 'Menu Hell Let Loose' }).first()).toBeVisible();
});

test('a fresh load selects again within the enabled set', async ({ browser }) => {
  const seen = new Set<string>();
  for (let i = 0; i < 6 && seen.size < 2; i += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await serveSyntheticMedia(page);
    await page.goto('/cs/hll');
    seen.add(await selectedClip(page));
    await context.close();
  }
  for (const id of seen) expect(SYNTHETIC_CLIP_IDS).toContain(id);
  test.info().annotations.push({ type: 'random-selection', description: `clips selected over fresh loads: ${[...seen].join(', ')}` });
});

test('makes no video request under reduced motion or Save-Data, and shows the poster', async ({ browser }) => {
  for (const setup of ['reduced-motion', 'save-data'] as const) {
    const context = await browser.newContext(setup === 'reduced-motion' ? { reducedMotion: 'reduce' } : {});
    const page = await context.newPage();
    if (setup === 'save-data') {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g', addEventListener() {}, removeEventListener() {} } });
      });
    }
    const log = await serveSyntheticMedia(page);
    await page.goto('/cs/hll');
    await selectedClip(page);
    await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'paused');
    await page.waitForTimeout(1000);
    expect(log.video, setup).toEqual([]);
    expect(log.poster.length, setup).toBeGreaterThan(0);
    await context.close();
  }
});

test('mobile default stays poster-first until the visitor starts playback', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const log = await serveSyntheticMedia(page);
  await page.goto('/cs/hll');
  await selectedClip(page);
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'paused');
  await page.waitForTimeout(1000);
  expect(log.video).toEqual([]);

  await page.locator('[data-hll-stage-toggle]').click();
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'playing', { timeout: 15_000 });
  expect(log.video.every((path) => path.endsWith('-compact.webm'))).toBe(true);
  await context.close();
});

test('an explicit pause is kept across navigation until the visitor resumes', async ({ page }) => {
  await serveSyntheticMedia(page);
  await page.goto('/cs/hll');
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'playing', { timeout: 15_000 });
  const toggle = page.locator('[data-hll-stage-toggle]');
  await expect(page.locator('[data-hll-footer]')).toBeVisible();
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'paused');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);

  await page.locator('[data-hll-menu="landing"] [data-hll-menu-item="matches"]').click();
  await expect(page).toHaveURL(/\/cs\/hll\/matches$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/cs\/hll$/);
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'paused');

  await page.locator('[data-hll-stage-toggle]').click();
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'playing', { timeout: 15_000 });
});

test('a failed source falls back to the poster after one alternate rendition', async ({ page }) => {
  const log = await serveSyntheticMedia(page, { fail: true });
  await page.goto('/cs/hll');
  const clip = await selectedClip(page);
  await expect(stage(page)).toHaveAttribute('data-hll-stage-state', 'unavailable', { timeout: 15_000 });
  expect(new Set(log.video)).toEqual(new Set([`/e2e-media/${clip}-desktop.webm`, `/e2e-media/${clip}-compact.webm`]));
  await expect(page.locator('[data-hll-stage-toggle]')).toBeDisabled();
  // Navigation and landmarks keep working without media.
  await expect(page.getByRole('navigation', { name: 'Menu Hell Let Loose' }).first()).toBeVisible();
});
