import { z } from 'zod';

/**
 * HLL cinematic-stage media contract (docs/design/hll/visual-spec.md §9). A reviewed clip
 * set is configured server-side; only enabled clips with provenance, rights record and at
 * least one rendition reach the browser. No clan footage is supplied yet: the default set
 * is empty and the stage shows its static fallback. Pure module (server and client).
 */

export const HLL_CLIP_TYPES = ['video/webm', 'video/mp4'] as const;
export type HllClipType = (typeof HLL_CLIP_TYPES)[number];
export type HllRenditionProfile = 'compact' | 'desktop';

export type HllRendition = { src: string; type: HllClipType; width: number; height: number; bytes: number; profile: HllRenditionProfile };

/** Browser-facing clip (no rights/provenance text, which stays in configuration and review records). */
export type HllClip = {
  id: string;
  posterUrl: string | null;
  durationSeconds: number;
  focalPoint: { x: number; y: number };
  renditions: HllRendition[];
};

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Same-origin path (`/media/hll/…`) or an HTTPS URL on an explicitly allowlisted origin. */
function mediaUrl(allowedOrigins: readonly string[]) {
  return z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
      if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return /^\/[A-Za-z0-9\-._~/]+$/.test(value);
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.username === '' && url.password === '' && allowedOrigins.includes(url.origin);
      } catch {
        return false;
      }
    }, 'must be a same-origin path or an HTTPS URL on an allowlisted media origin without credentials');
}

export function hllClipConfigSchema(allowedOrigins: readonly string[]) {
  const url = mediaUrl(allowedOrigins);
  return z
    .array(
      z.object({
        id: z.string().regex(ID).max(64),
        enabled: z.boolean(),
        /** Where the footage comes from and who approved it (owner review record). */
        provenance: z.string().trim().min(3).max(500),
        /** Rights/licence record identifier or description. */
        rights: z.string().trim().min(3).max(500),
        posterUrl: url.nullable().default(null),
        durationSeconds: z.number().positive().max(24 * 60 * 60),
        focalPoint: z
          .object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
          .default({ x: 50, y: 50 }),
        renditions: z
          .array(
            z.object({
              src: url,
              type: z.enum(HLL_CLIP_TYPES),
              width: z.number().int().positive().max(8192),
              height: z.number().int().positive().max(8192),
              bytes: z.number().int().positive(),
              profile: z.enum(['compact', 'desktop']),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .max(24)
    .refine((clips) => new Set(clips.map((clip) => clip.id)).size === clips.length, 'clip IDs must be unique');
}

/**
 * Parses the configured JSON. Invalid configuration disables the whole set (the stage
 * keeps its fallback) and reports only a generic reason; a partial, unreviewed set is
 * never served.
 */
export function parseHllClipConfig(json: string, allowedOrigins: readonly string[]): { clips: HllClip[]; error: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(json || '[]');
  } catch {
    return { clips: [], error: 'invalid_json' };
  }
  const parsed = hllClipConfigSchema(allowedOrigins).safeParse(raw);
  if (!parsed.success) return { clips: [], error: 'invalid_config' };
  const clips = parsed.data
    .filter((clip) => clip.enabled)
    .map((clip) => ({
      id: clip.id,
      posterUrl: clip.posterUrl,
      durationSeconds: clip.durationSeconds,
      focalPoint: clip.focalPoint,
      renditions: clip.renditions.map((rendition) => ({ ...rendition })),
    }));
  return { clips, error: null };
}

/** Uniform choice among the enabled clips; `null` for an empty set. `random` ∈ [0, 1). */
export function pickClipId(ids: readonly string[], random: number): string | null {
  if (ids.length === 0) return null;
  const index = Math.min(ids.length - 1, Math.max(0, Math.floor(random * ids.length)));
  return ids[index] ?? null;
}

export type NavigationKind = 'navigate' | 'reload' | 'back_forward' | 'prerender' | 'unknown';

/** Language switches reload the document; the chosen clip is handed over for this long. */
export const CLIP_HANDOFF_TTL_MS = 30_000;

/**
 * Initial clip of a document. A reload or an ordinary fresh opening is a new selection
 * opportunity (it may legitimately pick the same clip again). History traversal and a
 * language switch (recent handoff) keep the tab's selection. A stored ID that is no
 * longer in the enabled set is not replaced: the visit stays on the poster (`null`).
 */
export function resolveInitialClip(input: {
  ids: readonly string[];
  navigation: NavigationKind;
  stored: string | null;
  handoff: { id: string; at: number } | null;
  now: number;
  random: number;
}): { id: string | null; source: 'handoff' | 'history' | 'random' | 'removed' } {
  const { ids, navigation, stored, handoff, now, random } = input;
  const keep = (id: string, source: 'handoff' | 'history') => (ids.includes(id) ? { id, source } : { id: null, source: 'removed' as const });
  if (navigation !== 'reload' && handoff && now - handoff.at >= 0 && now - handoff.at <= CLIP_HANDOFF_TTL_MS) return keep(handoff.id, 'handoff');
  if (navigation === 'back_forward' && stored) return keep(stored, 'history');
  return { id: pickClipId(ids, random), source: 'random' };
}

/**
 * Rendition chosen once per selection: compact for narrow layouts, desktop otherwise,
 * preferring a type the browser reports it can play. `exclude` skips a failed source.
 */
export function chooseRendition(
  clip: Pick<HllClip, 'renditions'>,
  compact: boolean,
  canPlay: (type: HllClipType) => boolean,
  exclude: readonly string[] = [],
): HllRendition | null {
  const wanted: HllRenditionProfile = compact ? 'compact' : 'desktop';
  const candidates = clip.renditions.filter((rendition) => !exclude.includes(rendition.src) && canPlay(rendition.type));
  return candidates.find((rendition) => rendition.profile === wanted) ?? candidates[0] ?? null;
}
