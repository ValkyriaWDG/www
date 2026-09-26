import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContextOptions, devices, expect, type Page, test } from '@playwright/test';
import { signInAs } from '../support/auth';
import { BACKGROUND_DELIVERY, DELIVERY_DURATION_SECONDS, MEDIA_DIR, MEDIA_PATH_PREFIX, readDelivery, readMp4Tracks, sha256 } from './delivery';

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
      expect(mp4.tracks[0]?.durationSeconds).toBeCloseTo(DELIVERY_DURATION_SECONDS, 1);
      expect(mp4.faststart, filename).toBe(true);
      containers[filename] = mp4;
    }
    await record('delivery', { served, containers }, browser);
  });

  test('every rendition loads the full sequence and seeks to the middle and near the end', async ({ browser }) => {
    test.setTimeout(120_000);
    const delivered = await readDelivery();
    const context = await browser.newContext(DESKTOP);
    const page = await context.newPage();
    // Poster-only visit so the application's own player never competes with the probes.
    await page.goto('/cs');
    await page.getByRole('button', { name: PAUSE.cs }).click();
    const renditions = [
      { filename: BACKGROUND_DELIVERY.mp4, type: 'video/mp4; codecs="avc1.640028"', width: 1920, height: 1080 },
      { filename: BACKGROUND_DELIVERY.compactMp4, type: 'video/mp4; codecs="avc1.64001f"', width: 1280, height: 720 },
      { filename: BACKGROUND_DELIVERY.webm, type: 'video/webm; codecs="vp9"', width: 1920, height: 1080 },
    ];
    const results: Record<string, unknown>[] = [];
    for (const rendition of renditions) {
      const result = await page.evaluate(
        async ({ src, type }) => {
          const video = document.createElement('video');
          const support = video.canPlayType(type);
          video.muted = true;
          video.preload = 'auto';
          const once = (name: string) =>
            new Promise<string>((resolve) => {
              video.addEventListener(name, () => resolve(name), { once: true });
              video.addEventListener('error', () => resolve('error'), { once: true });
            });
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 36;
          const context2d = canvas.getContext('2d', { willReadFrequently: true })!;
          const luma = () => {
            context2d.drawImage(video, 0, 0, 64, 36);
            const data = context2d.getImageData(0, 0, 64, 36).data;
            let sum = 0;
            for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
            return sum / (data.length / 4);
          };
          const loaded = once('loadeddata');
          video.src = src;
          if ((await loaded) === 'error') return { support, error: video.error?.code ?? null };
          const seek = async (target: number) => {
            const seeked = once('seeked');
            video.currentTime = target;
            const outcome = await seeked;
            return { target, outcome, currentTime: video.currentTime, readyState: video.readyState, meanLuma: luma() };
          };
          const facts = { support, duration: video.duration, width: video.videoWidth, height: video.videoHeight };
          const middle = await seek(video.duration / 2);
          const nearEnd = await seek(video.duration - 0.25);
          video.removeAttribute('src');
          video.load();
          return { ...facts, middle, nearEnd, error: null };
        },
        { src: `${MEDIA_PATH_PREFIX}${rendition.filename}`, type: rendition.type },
      );
      results.push({ filename: rendition.filename, ...result });
      if (!('middle' in result)) {
        // Only a rendition this browser build cannot decode (e.g. no H.264) may fail, and it must
        // report MEDIA_ERR_SRC_NOT_SUPPORTED rather than hang.
        expect(result.support, rendition.filename).toBe('');
        expect(result.error, rendition.filename).toBe(4);
        continue;
      }
      expect(result).toMatchObject({ width: rendition.width, height: rendition.height });
      expect(result.duration).toBeCloseTo(DELIVERY_DURATION_SECONDS, 1);
      for (const point of [result.middle, result.nearEnd]) {
        expect(point?.outcome, rendition.filename).toBe('seeked');
        expect(Math.abs((point?.currentTime ?? 0) - (point?.target ?? 1)), rendition.filename).toBeLessThan(0.1);
        expect(point?.readyState ?? 0, rendition.filename).toBeGreaterThanOrEqual(2);
        expect(point?.meanLuma ?? 0, rendition.filename).toBeGreaterThan(1);
      }
    }
    // This check needs at least one decodable rendition.
    expect(results.some((result) => result.error === null)).toBe(true);
    await record('rendition-seeks', { mediaDigests: mediaDigests(delivered), renditions: results }, browser);
    await context.close();
  });

  test('desktop: the persistent player plays the full sequence from the start through one natural wrap', async ({ browser }) => {
    test.setTimeout(330_000);
    const delivered = await readDelivery();
    const context = await browser.newContext(DESKTOP);
    // Observe the application's own element from its creation: lifecycle events, wrap
    // (timeupdate drop), and per-frame 64×36 luma samples via requestVideoFrameCallback.
    await context.addInitScript(() => {
      type Sample = { mediaTime: number; luma: number; delta: number | null };
      const log = {
        events: {} as Record<string, number>,
        firstPlaying: null as null | { at: number; currentTime: number },
        wraps: [] as { from: number; to: number; at: number; totalVideoFrames: number | null; droppedVideoFrames: number | null }[],
        samples: [] as Sample[],
        gapsMs: [] as number[],
        rates: new Set<number>(),
        /** Times the video layer stopped covering the poster after playback began. */
        layerHides: 0,
      };
      (window as unknown as { __mediaLog: typeof log }).__mediaLog = log;
      const attach = (element: HTMLVideoElement) => {
        let last = 0;
        const container = element.closest('[data-background-state]');
        if (container) {
          new MutationObserver(() => {
            if (log.firstPlaying && !container.hasAttribute('data-video-visible')) log.layerHides += 1;
          }).observe(container, { attributes: true, attributeFilter: ['data-video-visible'] });
        }
        for (const name of ['playing', 'pause', 'waiting', 'stalled', 'error', 'ended', 'seeking', 'seeked']) {
          element.addEventListener(name, () => {
            log.events[name] = (log.events[name] ?? 0) + 1;
            if (name === 'playing' && !log.firstPlaying) log.firstPlaying = { at: performance.now(), currentTime: element.currentTime };
          });
        }
        element.addEventListener('timeupdate', () => {
          log.rates.add(element.playbackRate);
          if (element.currentTime + 1 < last) {
            const quality = element.getVideoPlaybackQuality?.();
            log.wraps.push({
              from: last,
              to: element.currentTime,
              at: performance.now(),
              totalVideoFrames: quality?.totalVideoFrames ?? null,
              droppedVideoFrames: quality?.droppedVideoFrames ?? null,
            });
          }
          last = element.currentTime;
        });
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 36;
        const context2d = canvas.getContext('2d', { willReadFrequently: true });
        let previous: Float32Array | null = null;
        let lastNow = 0;
        const onFrame: VideoFrameRequestCallback = (now, metadata) => {
          if (context2d) {
            context2d.drawImage(element, 0, 0, 64, 36);
            const data = context2d.getImageData(0, 0, 64, 36).data;
            const gray = new Float32Array(64 * 36);
            let sum = 0;
            for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
              gray[p] = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
              sum += gray[p]!;
            }
            let delta: number | null = null;
            if (previous) {
              delta = 0;
              for (let p = 0; p < gray.length; p += 1) delta += Math.abs(gray[p]! - previous[p]!);
              delta /= gray.length;
            }
            log.samples.push({ mediaTime: metadata.mediaTime, luma: sum / gray.length, delta });
            previous = gray;
          }
          if (lastNow) log.gapsMs.push(now - lastNow);
          lastNow = now;
          element.requestVideoFrameCallback(onFrame);
        };
        element.requestVideoFrameCallback(onFrame);
      };
      new MutationObserver((_, observer) => {
        const element = document.querySelector<HTMLVideoElement>('[data-background-video]');
        if (element) {
          attach(element);
          observer.disconnect();
        }
      }).observe(document, { childList: true, subtree: true });
    });
    const page = await context.newPage();
    const requests = trackVideoRequests(page);
    const support = await page.evaluate(() => {
      const probe = document.createElement('video');
      return { h264: probe.canPlayType('video/mp4; codecs="avc1.640028"'), vp9: probe.canPlayType('video/webm; codecs="vp9"') };
    });
    await page.goto('/cs');
    const media = page.locator('[data-background-state]');
    await expect(media).toHaveAttribute('data-background-state', 'playing');
    await expect(media).toHaveAttribute('data-background-reason', 'allowed');
    const poster = await posterFacts(page);
    expect(poster).toMatchObject({ src: `${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.poster}`, naturalWidth: 1920, naturalHeight: 1080 });

    const advancing = await expectAdvancing(page);
    const facts = await videoFacts(page);
    expect(facts).toMatchObject({ paused: false, loop: true, muted: true, videoWidth: 1920, videoHeight: 1080, objectFit: 'cover', videoElements: 1 });
    expect(facts.duration).toBeCloseTo(DELIVERY_DURATION_SECONDS, 1);
    expect(facts.readyState).toBeGreaterThanOrEqual(3);
    expect(facts.videoDecodedBytes ?? 0).toBeGreaterThan(0);
    expect(facts.audioDecodedBytes ?? 0).toBe(0);
    // WebM is listed first; a browser without H.264 must never select the MP4.
    if (support.vp9) expect(facts.currentSrc).toBe(`${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.webm}`);

    // Compositing: media at the bottom, scrim/vignette above it, the faded crest a separate top layer.
    const layers = await page.evaluate(() => {
      const style = (selector: string) => {
        const element = document.querySelector(selector)!;
        const computed = getComputedStyle(element);
        return { zIndex: Number(computed.zIndex) || 0, opacity: Number(computed.opacity), display: computed.display };
      };
      const mediaElement = document.querySelector('[data-background-state]')!;
      const emblem = document.querySelector('[data-emblem]')!;
      const scene = document.querySelector('[data-scene]')!;
      return {
        media: style('[data-background-state]'),
        scrim: { ...style('[data-scene] > div:nth-last-of-type(2)') },
        vignette: { ...style('[data-scene] > div:nth-last-of-type(1)') },
        emblem: style('[data-emblem]'),
        emblemInsideMedia: mediaElement.contains(emblem),
        emblemAfterMedia: Boolean(mediaElement.compareDocumentPosition(emblem) & Node.DOCUMENT_POSITION_FOLLOWING),
        sceneChildren: [...scene.children].map((child) => child.getAttribute('class')?.split(/\s+/)[0]?.replace(/^.*?_/, '') ?? child.tagName),
      };
    });
    expect(layers.emblemInsideMedia).toBe(false);
    expect(layers.emblemAfterMedia).toBe(true);
    expect(layers.emblem.display).toBe('block');
    expect(layers.emblem.opacity).toBeGreaterThan(0);
    expect(layers.emblem.opacity).toBeLessThan(0.3);
    expect(layers.emblem.zIndex).toBeGreaterThan(layers.media.zIndex);
    expect(layers.scrim.zIndex).toBeGreaterThan(layers.media.zIndex);

    await page.waitForTimeout(3_000);
    await screenshot(
      page,
      'cs-desktop-home-playing',
      { state: await backgroundState(page), currentTime: (await videoFacts(page)).currentTime, source: facts.currentSrc, mediaDigests: mediaDigests(delivered) },
      browser,
    );

    // One uninterrupted natural wrap at rate 1 (~192.5 s of playback).
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __mediaLog: { wraps: unknown[] } }).__mediaLog.wraps.length), {
        timeout: 260_000,
        intervals: [2_000],
      })
      .toBeGreaterThanOrEqual(1);
    const log = await page.evaluate(() => {
      const value = (window as unknown as { __mediaLog: Record<string, unknown> & { rates: Set<number> } }).__mediaLog;
      return JSON.parse(JSON.stringify({ ...value, rates: [...value.rates] })) as {
        events: Record<string, number>;
        firstPlaying: { at: number; currentTime: number } | null;
        wraps: { from: number; to: number; at: number; totalVideoFrames: number | null; droppedVideoFrames: number | null }[];
        samples: { mediaTime: number; luma: number; delta: number | null }[];
        gapsMs: number[];
        rates: number[];
        layerHides: number;
      };
    });
    const after = await videoFacts(page);
    const wrap = log.wraps[0]!;
    const elapsedSeconds = log.firstPlaying ? (wrap.at - log.firstPlaying.at) / 1000 : null;
    expect(log.firstPlaying?.currentTime ?? 1).toBeLessThan(0.5);
    expect(log.rates).toEqual([1]);
    expect(log.events.pause ?? 0).toBe(0);
    expect(log.events.error ?? 0).toBe(0);
    expect(log.events.ended ?? 0).toBe(0);
    // Rebuffering (`waiting`) keeps the presented frame instead of flashing back to the poster.
    expect(log.layerHides).toBe(0);
    expect(wrap.from).toBeGreaterThan(DELIVERY_DURATION_SECONDS - 1);
    expect(elapsedSeconds ?? 0).toBeGreaterThan(DELIVERY_DURATION_SECONDS - 2);
    expect(after).toMatchObject({ paused: false, videoElements: 1 });

    const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
    const percentile = (values: number[], q: number) => {
      const list = sorted(values);
      return list.length ? Number(list[Math.min(list.length - 1, Math.floor(q * (list.length - 1)))]!.toFixed(4)) : null;
    };
    // Samples of the first pass only (up to the wrap), plus the frame pair across the wrap.
    const wrapIndex = log.samples.findIndex((sample, index) => index > 0 && sample.mediaTime + 1 < log.samples[index - 1]!.mediaTime);
    const firstPass = wrapIndex > 0 ? log.samples.slice(0, wrapIndex) : log.samples;
    const deltas = firstPass.map((sample) => sample.delta).filter((delta): delta is number => delta !== null);
    const darkest = firstPass.reduce((a, b) => (b.luma < a.luma ? b : a));
    const brightest = firstPass.reduce((a, b) => (b.luma > a.luma ? b : a));
    const mediaSteps = firstPass.slice(1).map((sample, index) => sample.mediaTime - firstPass[index]!.mediaTime).filter((step) => step > 0);

    // Readability over the darkest and brightest sampled frames of the full sequence.
    const extremes: Record<string, unknown>[] = [];
    for (const [name, sample] of [
      ['darkest', darkest],
      ['brightest', brightest],
    ] as const) {
      await page.locator('[data-background-video]').evaluate((element: HTMLVideoElement, time) => {
        element.currentTime = time;
      }, sample.mediaTime);
      await expect(media).toHaveAttribute('data-background-state', 'playing');
      await page.waitForTimeout(600);
      const capturedAt = (await videoFacts(page)).currentTime;
      await screenshot(page, `cs-desktop-home-${name}-frame`, { sampledMediaTime: sample.mediaTime, sampledMeanLuma: sample.luma, capturedAt, mediaDigests: mediaDigests(delivered) }, browser);
      extremes.push({ name, sampledMediaTime: sample.mediaTime, sampledMeanLuma: sample.luma, capturedAt });
    }

    await record(
      'playback-natural-wrap',
      {
        viewport: DESKTOP.viewport,
        codecSupport: support,
        mediaDigests: mediaDigests(delivered),
        selectedSource: facts.currentSrc,
        element: facts,
        elementAfterWrap: after,
        advancing,
        poster,
        layers,
        firstPlaying: log.firstPlaying,
        wrap,
        elapsedSecondsToWrap: elapsedSeconds,
        events: log.events,
        videoLayerHides: log.layerHides,
        playbackRates: log.rates,
        frameCallbacksFirstPass: firstPass.length,
        medianMediaTimeStep: percentile(mediaSteps, 0.5),
        frameGapMs: { median: percentile(log.gapsMs, 0.5), p95: percentile(log.gapsMs, 0.95), max: percentile(log.gapsMs, 1) },
        consecutiveSampleLumaDelta: { median: percentile(deltas, 0.5), p95: percentile(deltas, 0.95), p99: percentile(deltas, 0.99), max: percentile(deltas, 1) },
        wrapSampleLumaDelta: wrapIndex > 0 ? log.samples[wrapIndex]!.delta : null,
        frameMeanLuma: { min: percentile(firstPass.map((s) => s.luma), 0), median: percentile(firstPass.map((s) => s.luma), 0.5), max: percentile(firstPass.map((s) => s.luma), 1) },
        extremes,
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
