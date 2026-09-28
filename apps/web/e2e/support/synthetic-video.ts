import type { BrowserContext, Page, Route } from '@playwright/test';

/**
 * Explicitly labelled synthetic test media for the HLL stage. The clip is a moving test
 * pattern reading "SYNTHETIC TEST CLIP", recorded in the browser itself (canvas +
 * MediaRecorder) so no footage or binary fixture is committed. It proves the playback
 * lifecycle only; real HLL footage acceptance stays a separate gate.
 */

/** Must match HLL_BACKGROUND_CLIPS_JSON in e2e/support/server-env.ts. */
export const SYNTHETIC_CLIP_IDS = ['synthetic-a', 'synthetic-b'] as const;
export const SYNTHETIC_MEDIA_PREFIX = '/e2e-media/';

let cached: Buffer | null = null;

async function recordWebm(context: BrowserContext): Promise<Buffer> {
  if (cached) return cached;
  const page = await context.newPage();
  try {
    const base64 = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d')!;
      const stream = canvas.captureStream(20);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start(100);
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const draw = () => {
          const t = performance.now() - started;
          ctx.fillStyle = '#20242a';
          ctx.fillRect(0, 0, 320, 180);
          ctx.fillStyle = '#c5b967';
          ctx.fillRect((t / 6) % 320, 80, 40, 60);
          ctx.fillStyle = '#ffffff';
          ctx.font = '16px sans-serif';
          ctx.fillText('SYNTHETIC TEST CLIP', 70, 40);
          if (t < 1600) requestAnimationFrame(draw);
          else resolve();
        };
        draw();
      });
      recorder.stop();
      await stopped;
      const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    });
    cached = Buffer.from(base64, 'base64');
    return cached;
  } finally {
    await page.close();
  }
}

// 1×1 dark PNG poster.
const POSTER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export type SyntheticMediaLog = { video: string[]; poster: string[] };

/**
 * Serves the synthetic clip for every configured rendition (or fails them with `fail`)
 * and records each media request, so tests can assert exactly what the page fetched.
 */
export async function serveSyntheticMedia(page: Page, options: { fail?: boolean } = {}): Promise<SyntheticMediaLog> {
  const log: SyntheticMediaLog = { video: [], poster: [] };
  const webm = options.fail ? null : await recordWebm(page.context());
  await page.route(`**${SYNTHETIC_MEDIA_PREFIX}**`, async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('.png')) {
      log.poster.push(path);
      await route.fulfill({ status: 200, contentType: 'image/png', body: POSTER });
      return;
    }
    log.video.push(path);
    if (!webm) await route.fulfill({ status: 404, body: '' });
    else await route.fulfill({ status: 200, contentType: 'video/webm', body: webm, headers: { 'Accept-Ranges': 'none' } });
  });
  return log;
}

/** Clip ids referenced by the recorded video requests. */
export function requestedClipIds(log: SyntheticMediaLog): string[] {
  return [...new Set(log.video.map((path) => path.slice(SYNTHETIC_MEDIA_PREFIX.length).replace(/-(desktop|compact)\.webm$/, '')))];
}
