import 'server-only';
import { type BackgroundMediaConfig, type BackgroundSource, DEFAULT_FOCAL_POINT } from '@/components/shell/background-policy';
import { getServerEnv } from './env';

/**
 * Approved background media for the persistent shell scene. Today it comes from runtime
 * configuration (`BACKGROUND_POSTER_URL`, `BACKGROUND_VIDEO_WEBM_URL`,
 * `BACKGROUND_VIDEO_MP4_URL`); a later site-settings integration may add database
 * overrides behind this same function. Decorative media never breaks a page: invalid
 * configuration yields the original CSS/SVG fallback scene (no poster, no sources).
 */
export function getBackgroundMedia(): BackgroundMediaConfig {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return { posterUrl: null, sources: [], focalPoint: DEFAULT_FOCAL_POINT };
  }
  const sources: BackgroundSource[] = [];
  // The browser picks the first playable source; WebM (if supplied) is usually smaller.
  if (env.BACKGROUND_VIDEO_WEBM_URL) sources.push({ src: env.BACKGROUND_VIDEO_WEBM_URL, type: 'video/webm' });
  if (env.BACKGROUND_VIDEO_MP4_URL) sources.push({ src: env.BACKGROUND_VIDEO_MP4_URL, type: 'video/mp4' });
  return { posterUrl: env.BACKGROUND_POSTER_URL ?? null, sources, focalPoint: DEFAULT_FOCAL_POINT };
}
