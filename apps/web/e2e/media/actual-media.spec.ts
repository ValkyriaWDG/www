import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContextOptions, devices, expect, type Page, test } from '@playwright/test';
import { signInAs } from '../support/auth';
import { BACKGROUND_DELIVERY, MEDIA_DIR, MEDIA_PATH_PREFIX, readDelivery, readMp4Tracks, sha256 } from './delivery';

/*
 * Actual-byte checks for the delivered background media, run against the standalone
 * production build. Nothing here overrides HTMLMediaElement: playback, decoding and
 * looping are the browser's own. Measurements and screenshots are written to the ignored
 * `.local/evidence/background-media/` directory with the tested revision and browser.
 */

const EVIDENCE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.local/evidence/background-media');
const MIME = { mp4: 'video/mp4', webm: 'video/webm', webp: 'image/webp' } as const;
const DESKTOP = { viewport: { width: 1440, height: 900 } } satisfies BrowserContextOptions;
const MOBILE = {
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
} satisfies BrowserContextOptions;
const PAUSE = { cs: 'Pozastavit pozadí', en: 'Pause background' } as const;
const PLAY = { cs: 'Přehrát pozadí', en: 'Play background' } as const;

function revision(): { sha: string; dirty: boolean } {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
    return { sha, dirty };
  } catch {
    return { sha: 'unknown', dirty: true };
  }
}

async function record(name: string, data: Record<string, unknown>, browser?: Browser): Promise<void> {
  await mkdir(path.join(EVIDENCE_DIR, 'measurements'), { recursive: true });
  const payload = { check: name, recordedAt: new Date().toISOString(), revision: revision(), browser: browser?.version(), ...data };
  await writeFile(path.join(EVIDENCE_DIR, 'measurements', `${name}.json`), `${JSON.stringify(payload, null, 2)}\n`);
}

/** Every request for a delivered video file (`/media/background/*.mp4|webm`), with its Range header. */
function trackVideoRequests(page: Page): { url: string; range: string | null }[] {
  const requests: { url: string; range: string | null }[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith(MEDIA_PATH_PREFIX) && /\.(mp4|webm)$/.test(pathname)) {
      requests.push({ url: pathname, range: request.headers()['range'] ?? null });
    }
  });
  return requests;
}

type VideoFacts = {
  paused: boolean;
  currentTime: number;
  currentSrc: string;
  readyState: number;
  videoWidth: number;
  videoHeight: number;
  duration: number;
  loop: boolean;
  muted: boolean;
  objectFit: string;
  videoDecodedBytes: number | null;
  audioDecodedBytes: number | null;
  totalVideoFrames: number | null;
  droppedVideoFrames: number | null;
  videoElements: number;
};

function videoFacts(page: Page): Promise<VideoFacts> {
  return page.locator('[data-background-video]').evaluate((element: HTMLVideoElement) => {
    const webkit = element as HTMLVideoElement & { webkitVideoDecodedByteCount?: number; webkitAudioDecodedByteCount?: number };
    const quality = element.getVideoPlaybackQuality?.();
    return {
      paused: element.paused,
      currentTime: element.currentTime,
      currentSrc: new URL(element.currentSrc || 'http://x/').pathname,
      readyState: element.readyState,
      videoWidth: element.videoWidth,
      videoHeight: element.videoHeight,
      duration: element.duration,
      loop: element.loop,
      muted: element.muted,
      objectFit: getComputedStyle(element).objectFit,
      videoDecodedBytes: webkit.webkitVideoDecodedByteCount ?? null,
      audioDecodedBytes: webkit.webkitAudioDecodedByteCount ?? null,
      totalVideoFrames: quality?.totalVideoFrames ?? null,
      droppedVideoFrames: quality?.droppedVideoFrames ?? null,
      videoElements: document.querySelectorAll('video').length,
    };
  });
}

async function posterFacts(page: Page): Promise<{ src: string; complete: boolean; naturalWidth: number; naturalHeight: number; visible: boolean }> {
  const poster = page.locator('[data-background-state] img');
  await expect(poster).toHaveCount(1);
  await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // `decoding="async"`: a complete image may not be painted yet; wait for decode and a frame.
  await poster.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  return poster.evaluate((img: HTMLImageElement) => ({
    src: new URL(img.currentSrc || img.src).pathname,
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    visible: getComputedStyle(img).visibility !== 'hidden' && Number(getComputedStyle(img).opacity) > 0,
  }));
}

async function backgroundState(page: Page): Promise<{ state: string | null; reason: string | null }> {
  const media = page.locator('[data-background-state]');
  return { state: await media.getAttribute('data-background-state'), reason: await media.getAttribute('data-background-reason') };
}

async function expectAdvancing(page: Page, minimumSeconds = 0.5): Promise<{ from: number; to: number }> {
  const from = (await videoFacts(page)).currentTime;
  await expect.poll(async () => (await videoFacts(page)).currentTime - from, { timeout: 10_000 }).toBeGreaterThan(minimumSeconds);
  return { from, to: (await videoFacts(page)).currentTime };
}

async function screenshot(page: Page, name: string, details: Record<string, unknown>, browser: Browser): Promise<void> {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  // Let the font swap and scene transitions settle before capturing.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), animations: 'allow' });
  await record(`screenshot-${name}`, { url: new URL(page.url()).pathname, viewport: page.viewportSize(), ...details }, browser);
}

function mediaDigests(files: Awaited<ReturnType<typeof readDelivery>>): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file.filename, file.sha256]));
}

test.describe('delivered background media', () => {
  test('the server returns the verified bytes with media types and byte ranges', async ({ request, browser }) => {
    const delivered = await readDelivery();
    const served: Record<string, unknown>[] = [];
    for (const file of delivered) {
      const url = `${MEDIA_PATH_PREFIX}${file.filename}`;
      const response = await request.get(url);
      expect(response.status(), url).toBe(200);
      expect(sha256(await response.body()), url).toBe(file.sha256);
      const extension = file.filename.split('.').pop() as keyof typeof MIME;
      expect(response.headers()['content-type'], url).toContain(MIME[extension]);
      expect(response.headers()['cache-control'], url).toBe('public, max-age=31536000, immutable');
      const partial = await request.get(url, { headers: { Range: 'bytes=0-1023' } });
      expect(partial.status(), url).toBe(206);
      expect(partial.headers()['content-range'], url).toBe(`bytes 0-1023/${file.bytes}`);
      served.push({
        ...file,
        contentType: response.headers()['content-type'],
        cacheControl: response.headers()['cache-control'] ?? null,
        acceptRanges: response.headers()['accept-ranges'] ?? null,
        rangeStatus: partial.status(),
      });
    }

    // Container facts for both H.264 files: one video track, no audio, moov before mdat.
    const containers: Record<string, unknown> = {};
    for (const [filename, width, height] of [
      [BACKGROUND_DELIVERY.mp4, 1920, 1080],
      [BACKGROUND_DELIVERY.compactMp4, 1280, 720],
    ] as const) {
      const mp4 = readMp4Tracks(await readFile(path.join(MEDIA_DIR, filename)));
      expect(mp4.tracks.map((track) => track.handler), filename).toEqual(['vide']);
      expect(mp4.tracks[0]).toMatchObject({ width, height });
      expect(mp4.tracks[0]?.durationSeconds).toBeCloseTo(15, 1);
      expect(mp4.faststart, filename).toBe(true);
      containers[filename] = mp4;
    }
    await record('delivery', { served, containers }, browser);
  });

  test('desktop: the persistent player decodes the clip, advances and completes three loops', async ({ browser }) => {
    test.setTimeout(150_000);
    const delivered = await readDelivery();
    const context = await browser.newContext(DESKTOP);
    const page = await context.newPage();
    const requests = trackVideoRequests(page);
    // Codec support of this browser build decides which delivered source it can decode.
    const support = await page.evaluate(() => {
      const probe = document.createElement('video');
      return { h264: probe.canPlayType('video/mp4; codecs="avc1.640028"'), vp9: probe.canPlayType('video/webm; codecs="vp9"') };
    });
    await page.goto('/cs');
    const media = page.locator('[data-background-state]');
    await expect(media).toHaveAttribute('data-background-state', 'playing');
    await expect(media).toHaveAttribute('data-background-reason', 'allowed');
    await expect(page.getByRole('button', { name: PAUSE.cs })).toBeVisible();
    const poster = await posterFacts(page);
    expect(poster).toMatchObject({ src: `${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.poster}`, naturalWidth: 1920, naturalHeight: 1080 });
    // The clan emblem is a separate overlay, never part of the media.
    await expect(page.locator('[data-emblem]')).toHaveCount(1);

    const advancing = await expectAdvancing(page);
    const facts = await videoFacts(page);
    expect(facts).toMatchObject({ paused: false, loop: true, muted: true, videoWidth: 1920, videoHeight: 1080, objectFit: 'cover', videoElements: 1 });
    expect(facts.duration).toBeCloseTo(15, 1);
    expect(facts.readyState).toBeGreaterThanOrEqual(3);
    expect(facts.videoDecodedBytes ?? 0).toBeGreaterThan(0);
    expect(facts.audioDecodedBytes ?? 0).toBe(0);
    // WebM is listed first; a browser without H.264 must never select the MP4.
    if (support.vp9) expect(facts.currentSrc).toBe(`${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.webm}`);

    // Loop monitor on the application's own element: wraps from `timeupdate`, and per-frame
    // luma samples (64×36 canvas) from requestVideoFrameCallback for seam continuity.
    await page.locator('[data-background-video]').evaluate((element: HTMLVideoElement) => {
      type Log = {
        wraps: { from: number; to: number; at: number }[];
        frames: number;
        mediaTimes: number[];
        diffs: number[];
        seamDiffs: number[];
        luma: number[];
        gapsMs: number[];
        last: number;
      };
      const log: Log = { wraps: [], frames: 0, mediaTimes: [], diffs: [], seamDiffs: [], luma: [], gapsMs: [], last: element.currentTime };
      (window as unknown as { __loopLog: Log }).__loopLog = log;
      element.addEventListener('timeupdate', () => {
        if (element.currentTime + 1 < log.last) log.wraps.push({ from: log.last, to: element.currentTime, at: performance.now() });
        log.last = element.currentTime;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      const context2d = canvas.getContext('2d', { willReadFrequently: true });
      let previous: Float32Array | null = null;
      let lastMediaTime = -1;
      let lastNow = 0;
      const onFrame: VideoFrameRequestCallback = (now, metadata) => {
        if (context2d) {
          context2d.drawImage(element, 0, 0, 64, 36);
          const data = context2d.getImageData(0, 0, 64, 36).data;
          const gray = new Float32Array(64 * 36);
          let sum = 0;
          for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
            const y = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
            gray[p] = y;
            sum += y;
          }
          if (previous) {
            let delta = 0;
            for (let p = 0; p < gray.length; p += 1) delta += Math.abs(gray[p]! - previous[p]!);
            const wrapped = lastMediaTime >= 0 && metadata.mediaTime + 1 < lastMediaTime;
            (wrapped ? log.seamDiffs : log.diffs).push(delta / gray.length);
          }
          log.luma.push(sum / gray.length);
          previous = gray;
        }
        if (lastNow) log.gapsMs.push(now - lastNow);
        log.mediaTimes.push(metadata.mediaTime);
        lastMediaTime = metadata.mediaTime;
        lastNow = now;
        log.frames += 1;
        element.requestVideoFrameCallback(onFrame);
      };
      element.requestVideoFrameCallback(onFrame);
    });

    await page.waitForTimeout(3_000);
    await screenshot(
      page,
      'cs-desktop-home-playing',
      { state: await backgroundState(page), currentTime: (await videoFacts(page)).currentTime, source: facts.currentSrc, mediaDigests: mediaDigests(delivered) },
      browser,
    );

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __loopLog: { wraps: unknown[] } }).__loopLog.wraps.length), {
        timeout: 75_000,
        intervals: [1_000],
      })
      .toBeGreaterThanOrEqual(3);
    const log = await page.evaluate(() => {
      const value = (window as unknown as { __loopLog: Record<string, unknown> }).__loopLog;
      return JSON.parse(JSON.stringify(value)) as {
        wraps: { from: number; to: number; at: number }[];
        frames: number;
        mediaTimes: number[];
        diffs: number[];
        seamDiffs: number[];
        luma: number[];
        gapsMs: number[];
      };
    });
    const after = await videoFacts(page);
    expect(after.paused).toBe(false);
    expect(after.videoElements).toBe(1);

    const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
    const percentile = (values: number[], q: number) => {
      const list = sorted(values);
      return list.length ? list[Math.min(list.length - 1, Math.floor(q * (list.length - 1)))]! : null;
    };
    const mediaSteps = log.mediaTimes.slice(1).map((time, index) => time - log.mediaTimes[index]!).filter((step) => step > 0 && step < 1);
    const loopDurations = log.wraps.slice(1).map((wrap, index) => (wrap.at - log.wraps[index]!.at) / 1000);
    await record(
      'playback-loops',
      {
        viewport: DESKTOP.viewport,
        codecSupport: support,
        mediaDigests: mediaDigests(delivered),
        selectedSource: facts.currentSrc,
        element: facts,
        elementAfterLoops: after,
        advancing,
        poster,
        wraps: log.wraps,
        loopWallClockSeconds: loopDurations,
        frameCallbacks: log.frames,
        medianMediaTimeStep: percentile(mediaSteps, 0.5),
        frameGapMs: { median: percentile(log.gapsMs, 0.5), p95: percentile(log.gapsMs, 0.95), max: percentile(log.gapsMs, 1) },
        consecutiveFrameLumaDelta: { median: percentile(log.diffs, 0.5), p95: percentile(log.diffs, 0.95), max: percentile(log.diffs, 1) },
        seamFrameLumaDelta: log.seamDiffs,
        frameMeanLuma: { min: percentile(log.luma, 0), median: percentile(log.luma, 0.5), max: percentile(log.luma, 1) },
        videoRequests: requests,
      },
      browser,
    );
    await context.close();
  });

  test('one player continues across public navigation and stays static in administration', async ({ browser }) => {
    const context = await browser.newContext(DESKTOP);
    await signInAs(context, { roles: ['editor'], name: 'Synthetic media editor' });
    const page = await context.newPage();
    const requests = trackVideoRequests(page);
    await page.goto('/cs');
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-state', 'playing');
    await expectAdvancing(page);
    await page.locator('[data-background-video]').evaluate((element) => {
      (element as HTMLVideoElement & { __persistenceToken?: string }).__persistenceToken = 'initial-player';
    });
    const sameElement = () =>
      page
        .locator('[data-background-video]')
        .evaluate((element) => (element as HTMLVideoElement & { __persistenceToken?: string }).__persistenceToken === 'initial-player');

    const nav = page.getByRole('navigation', { name: 'Hlavní navigace' });
    const visited: Record<string, unknown>[] = [];
    for (const [label, pattern] of [
      ['NOVINKY', /\/cs\/news$/],
      ['ZÁPASY', /\/cs\/matches$/],
      ['ČLENOVÉ', /\/cs\/members$/],
      ['HLAVNÍ MENU', /\/cs$/],
    ] as const) {
      const before = (await videoFacts(page)).currentTime;
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(pattern);
      expect(await sameElement(), label).toBe(true);
      const facts = await videoFacts(page);
      expect(facts.paused, label).toBe(false);
      expect(facts.videoElements, label).toBe(1);
      await expectAdvancing(page, 0.3);
      visited.push({ route: new URL(page.url()).pathname, currentTimeBefore: before, currentTimeAfter: facts.currentTime, state: await backgroundState(page) });
    }
    // A fresh load starts at byte 0 (no Range or `bytes=0-`); navigation must not start another.
    const initialLoads = requests.filter((request) => request.range === null || request.range === 'bytes=0-');
    expect(initialLoads).toHaveLength(1);

    // Client navigation into administration pauses the same element (quiet static backdrop).
    await page.getByRole('button', { name: /^Účet:/ }).click();
    await page.getByRole('link', { name: 'SPRÁVA' }).click();
    await expect(page).toHaveURL(/\/cs\/admin/);
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-reason', 'route');
    expect(await sameElement()).toBe(true);
    await expect.poll(async () => (await videoFacts(page)).paused).toBe(true);
    const adminFacts = await videoFacts(page);
    await page.waitForTimeout(1_000);
    expect((await videoFacts(page)).currentTime).toBe(adminFacts.currentTime);

    // Back to the public site: the same element resumes.
    await page.goBack();
    await expect(page).toHaveURL(/\/cs$/);
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-state', 'playing');
    expect(await sameElement()).toBe(true);
    await expectAdvancing(page, 0.3);

    // A direct administration load never attaches sources.
    const adminPage = await context.newPage();
    const adminRequests = trackVideoRequests(adminPage);
    await adminPage.goto('/cs/admin');
    await expect(adminPage.locator('[data-background-state]')).toHaveAttribute('data-background-reason', 'route');
    await adminPage.waitForLoadState('networkidle');
    await expect(adminPage.locator('[data-background-video] source')).toHaveCount(0);
    expect(adminRequests).toEqual([]);

    await record('route-persistence', { visited, videoRequests: requests, admin: { facts: adminFacts, directLoadVideoRequests: adminRequests.length } }, browser);
    await context.close();
  });

  test('manual pause holds across routes and reloads, and resumes on request', async ({ browser }) => {
    const context = await browser.newContext(DESKTOP);
    const page = await context.newPage();
    await page.goto('/cs');
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-state', 'playing');
    await expectAdvancing(page);
    await page.getByRole('button', { name: PAUSE.cs }).click();
    await expect(page.getByRole('button', { name: PLAY.cs })).toBeVisible();
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-reason', 'user-paused');
    await expect.poll(async () => (await videoFacts(page)).paused).toBe(true);
    const pausedAt = (await videoFacts(page)).currentTime;
    await page.waitForTimeout(1_500);
    expect((await videoFacts(page)).currentTime).toBe(pausedAt);
    expect(await page.evaluate(() => window.localStorage.getItem('valkyria.background'))).toBe('paused');

    await page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('link', { name: 'KLAN', exact: true }).click();
    await expect(page).toHaveURL(/\/cs\/clan$/);
    expect((await videoFacts(page)).paused).toBe(true);

    // A fresh visit (new context: empty HTTP/media cache, same stored preference) keeps the
    // explicit pause, attaches no sources and makes no video request at all.
    const storageState = await context.storageState();
    const revisit = await browser.newContext({ ...DESKTOP, storageState });
    const next = await revisit.newPage();
    const reloadRequests = trackVideoRequests(next);
    await next.goto('/en');
    await expect(next.locator('[data-background-state]')).toHaveAttribute('data-background-reason', 'user-paused');
    await next.waitForLoadState('networkidle');
    await next.waitForTimeout(1_000);
    await expect(next.locator('[data-background-video] source')).toHaveCount(0);
    expect(reloadRequests).toEqual([]);
    const poster = await posterFacts(next);
    expect(poster.visible).toBe(true);

    await next.getByRole('button', { name: PLAY.en }).click();
    await expect(next.locator('[data-background-state]')).toHaveAttribute('data-background-state', 'playing');
    await expectAdvancing(next);
    expect(reloadRequests.length).toBeGreaterThan(0);
    expect(await next.evaluate(() => window.localStorage.getItem('valkyria.background'))).toBe('playing');
    await revisit.close();
    await record('manual-pause', { pausedAt, requestsWhilePaused: 0, requestsAfterResume: reloadRequests }, browser);
    await context.close();
  });

  test('a hidden tab pauses the real player and a visible one resumes it', async ({ browser }) => {
    const context = await browser.newContext(DESKTOP);
    const page = await context.newPage();
    await page.goto('/en');
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-state', 'playing');
    await expectAdvancing(page);
    // Headless Chromium keeps pages visible; the visibility signal is simulated, playback is real.
    const setHidden = (hidden: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await expect.poll(async () => (await videoFacts(page)).paused).toBe(true);
    const hiddenAt = (await videoFacts(page)).currentTime;
    await page.waitForTimeout(1_000);
    expect((await videoFacts(page)).currentTime).toBe(hiddenAt);
    await setHidden(false);
    await expect.poll(async () => (await videoFacts(page)).paused).toBe(false);
    const resumed = await expectAdvancing(page);
    await record('hidden-tab', { hiddenAt, resumed, visibility: 'simulated visibilitychange' }, browser);
    await context.close();
  });

  test('rejected media keeps the delivered poster without an error surface', async ({ browser }) => {
    const context = await browser.newContext(DESKTOP);
    const page = await context.newPage();
    await page.route(/\/media\/background\/.*\.(mp4|webm)$/, (route) => route.abort('failed'));
    await page.goto('/cs');
    await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-state', 'unavailable');
    const poster = await posterFacts(page);
    expect(poster).toMatchObject({ src: `${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.poster}`, naturalWidth: 1920, visible: true });
    await expect(page.locator('[data-background-toggle]')).toBeDisabled();
    await expect(page.locator('[data-route-mode]').getByRole('alert')).toHaveCount(0);
    await expect(page.locator('[data-cta="discord"]')).toBeVisible();
    await record('rejected-media', { state: await backgroundState(page), poster }, browser);
    await context.close();
  });

  for (const scenario of [
    { key: 'reduced-motion', reason: 'reduced-motion', options: { ...DESKTOP, reducedMotion: 'reduce' as const } },
    { key: 'save-data', reason: 'save-data', options: DESKTOP, saveData: true },
    { key: 'mobile', reason: 'narrow-coarse', options: MOBILE },
  ]) {
    test(`${scenario.key}: zero video requests before an explicit opt-in`, async ({ browser }) => {
      const delivered = await readDelivery();
      const context = await browser.newContext(scenario.options);
      if (scenario.saveData) {
        // Chromium exposes Save-Data only from browser settings; the Network Information API is simulated here.
        await context.addInitScript(() => {
          const connection = Object.assign(new EventTarget(), { saveData: true, effectiveType: '4g' });
          Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => connection });
        });
      }
      const page = await context.newPage();
      const requests = trackVideoRequests(page);
      const locales: Record<string, unknown>[] = [];
      for (const locale of ['cs', 'en'] as const) {
        await page.goto(`/${locale}`);
        const media = page.locator('[data-background-state]');
        await expect(media).toHaveAttribute('data-background-reason', scenario.reason);
        await expect(media).toHaveAttribute('data-background-state', 'paused');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1_500);
        await expect(page.locator('[data-background-video] source')).toHaveCount(0);
        expect(requests, `${scenario.key} ${locale}`).toEqual([]);
        const poster = await posterFacts(page);
        expect(poster).toMatchObject({ src: `${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.poster}`, naturalWidth: 1920, visible: true });
        await expect(page.getByRole('button', { name: PLAY[locale] })).toBeVisible();
        if (scenario.key !== 'save-data') {
          await screenshot(
            page,
            `${locale}-${scenario.key === 'mobile' ? 'mobile' : 'desktop'}-home-poster`,
            { state: await backgroundState(page), mediaDigests: mediaDigests(delivered), poster },
            browser,
          );
        }
        locales.push({ locale, state: await backgroundState(page), requestsBeforeOptIn: requests.length, poster });
      }

      // The explicit opt-in is the only way to start the download.
      await page.getByRole('button', { name: PLAY.en }).click();
      await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-state', 'playing');
      await expectAdvancing(page);
      expect(requests.length).toBeGreaterThan(0);
      if (scenario.key === 'mobile') {
        await page.getByRole('button', { name: PAUSE.en }).waitFor();
        await screenshot(
          page,
          'en-mobile-home-playing',
          { state: await backgroundState(page), currentTime: (await videoFacts(page)).currentTime, mediaDigests: mediaDigests(delivered) },
          browser,
        );
      }
      await record(`zero-requests-${scenario.key}`, { locales, afterOptIn: { requests, facts: await videoFacts(page) } }, browser);
      await context.close();
    });
  }

  test('Czech and English captures with the delivered media on desktop', async ({ browser }) => {
    const delivered = await readDelivery();
    // Deterministic poster frame: reduced motion keeps the delivered poster without playback.
    const context = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const route of ['/cs/news', '/en/news', '/en/matches']) {
      await page.goto(route);
      await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-reason', 'reduced-motion');
      await posterFacts(page);
      await screenshot(page, `${route.split('/')[1]}-desktop-${route.split('/')[2]}-poster`, { state: await backgroundState(page), mediaDigests: mediaDigests(delivered) }, browser);
    }
    await context.close();

    // Actual playback frame in English.
    const playing = await browser.newContext(DESKTOP);
    const livePage = await playing.newPage();
    await livePage.goto('/en');
    await expect(livePage.locator('[data-background-state]')).toHaveAttribute('data-background-state', 'playing');
    await expectAdvancing(livePage);
    await livePage.waitForTimeout(2_000);
    await screenshot(
      livePage,
      'en-desktop-home-playing',
      { state: await backgroundState(livePage), currentTime: (await videoFacts(livePage)).currentTime, mediaDigests: mediaDigests(delivered) },
      browser,
    );
    await playing.close();
  });
});
