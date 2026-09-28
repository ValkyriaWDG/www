import 'server-only';
import { parseHllClipConfig, type HllClip } from '@/modules/hll/media';
import { getServerEnv } from './env';

let warned = false;

/**
 * Enabled, reviewed HLL stage clips from `HLL_BACKGROUND_CLIPS_JSON`. Media URLs must be
 * same-origin paths or HTTPS URLs on `BACKGROUND_MEDIA_ALLOWED_ORIGINS` (already in the
 * CSP). An empty or invalid configuration yields the static fallback, never an error page.
 */
export async function getHllClipSet(): Promise<HllClip[]> {
  try {
    const env = getServerEnv();
    const origins = env.BACKGROUND_MEDIA_ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .flatMap((value) => {
        try {
          return [new URL(value).origin];
        } catch {
          return [];
        }
      });
    const { clips, error } = parseHllClipConfig(env.HLL_BACKGROUND_CLIPS_JSON, origins);
    if (error && !warned) {
      warned = true;
      console.warn(`[hll-media] ignoring clip configuration: ${error}`);
    }
    return clips;
  } catch {
    return [];
  }
}
