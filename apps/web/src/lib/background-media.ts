import 'server-only';
import { type BackgroundMediaConfig, type BackgroundSource, DEFAULT_FOCAL_POINT } from '@/components/shell/background-policy';
import { getSiteConfig } from './site-config';

/**
 * Approved background media for the persistent shell scene: runtime configuration
 * (`BACKGROUND_POSTER_URL`, `BACKGROUND_VIDEO_WEBM_URL`, `BACKGROUND_VIDEO_MP4_URL`)
 * optionally replaced by the validated `background.media` admin setting (allowlisted
 * origins only). Decorative media never breaks a page: missing or invalid configuration
 * yields the original CSS/SVG fallback scene (no poster, no sources).
 */
export async function getBackgroundMedia(): Promise<BackgroundMediaConfig> {
  const config = await getSiteConfig();
  if (!config) return { posterUrl: null, sources: [], focalPoint: DEFAULT_FOCAL_POINT };
  const sources: BackgroundSource[] = config.background.sources.filter(
    (source): source is BackgroundSource => source.type === 'video/webm' || source.type === 'video/mp4',
  );
  return { posterUrl: config.background.posterUrl ?? null, sources, focalPoint: config.background.focalPoint ?? DEFAULT_FOCAL_POINT };
}
