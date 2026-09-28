import type { BrowserContext, Page, Route } from '@playwright/test';

/**
 * Explicitly labelled synthetic test media for the HLL stage. The clip is a moving test
 * pattern reading "SYNTHETIC TEST CLIP" and its poster reads "SYNTHETIC TEST POSTER";
 * both are rendered in the browser itself (canvas + MediaRecorder), so no footage or
 * binary fixture is committed. They prove the playback lifecycle only; real HLL
 * footage acceptance stays a separate gate.
 */

/** Must match HLL_BACKGROUND_CLIPS_JSON in e2e/support/server-env.ts. */
export const SYNTHETIC_CLIP_IDS = ['synthetic-a', 'synthetic-b'] as const;
export const SYNTHETIC_MEDIA_PREFIX = '/e2e-media/';

let cached: { webm: Buffer; poster: Buffer } | null = null;

/** Records the clip and renders its poster (dark frame reading "SYNTHETIC TEST POSTER"). */
async function recordMedia(context: BrowserContext): Promise<{ webm: Buffer; poster: Buffer }> {
  if (cached) return cached;
  const page = await context.newPage();
  try {
    const { webm, poster } = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#1b1e23';
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = '#8d8f93';
      ctx.font = '16px sans-serif';
      ctx.fillText('SYNTHETIC TEST POSTER', 62, 96);
      const posterUrl = canvas.toDataURL('image/png');
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
      return { webm: btoa(binary), poster: posterUrl.slice(posterUrl.indexOf(',') + 1) };
    });
    cached = { webm: Buffer.from(webm, 'base64'), poster: Buffer.from(poster, 'base64') };
    return cached;
  } finally {
    await page.close();
  }
}

export type SyntheticMediaLog = { video: string[]; poster: string[] };

/**
 * Serves the synthetic clip for every configured rendition (or fails them with `fail`)
 * and records each media request, so tests can assert exactly what the page fetched.
 */
export async function serveSyntheticMedia(page: Page, options: { fail?: boolean } = {}): Promise<SyntheticMediaLog> {
  const log: SyntheticMediaLog = { video: [], poster: [] };
  const media = await recordMedia(page.context());
  const webm = options.fail ? null : media.webm;
  await page.route(`**${SYNTHETIC_MEDIA_PREFIX}**`, async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('.png')) {
      log.poster.push(path);
      await route.fulfill({ status: 200, contentType: 'image/png', body: media.poster });
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
