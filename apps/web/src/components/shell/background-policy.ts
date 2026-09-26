import type { RouteMode } from './route-mode';

/**
 * Pure background-media policy (docs/design/visual-spec.md §6, docs/assets/video-pipeline.md).
 * Decides whether video sources may be attached and played; the component only executes it.
 */

/** localStorage key holding the visitor's explicit choice (`paused` / `playing`). */
export const BACKGROUND_STORAGE_KEY = 'valkyria.background';

export type BackgroundSource = { src: string; type: 'video/mp4' | 'video/webm' };
/** Focal point in percent of the frame (0–100), used as `object-position`. */
export type FocalPoint = { x: number; y: number };
export type BackgroundMediaConfig = { posterUrl: string | null; sources: BackgroundSource[]; focalPoint: FocalPoint };

export const DEFAULT_FOCAL_POINT: FocalPoint = { x: 50, y: 50 };

/** `auto` = follow device/motion preferences; the other two are explicit visitor choices. */
export type BackgroundPreference = 'auto' | 'paused' | 'playing';

export type MotionEnvironment = {
  reducedMotion: boolean;
  saveData: boolean;
  slowConnection: boolean;
  narrowCoarsePointer: boolean;
};

export type PlaybackReason =
  | 'pending'
  | 'no-sources'
  | 'route'
  | 'user-paused'
  | 'user-playing'
  | 'reduced-motion'
  | 'save-data'
  | 'slow-connection'
  | 'narrow-coarse'
  | 'allowed';

export type PlaybackDecision = { play: boolean; reason: PlaybackReason };

/** Media element progress reported by events/promises. */
export type MediaStatus = 'idle' | 'loading' | 'playing' | 'blocked' | 'error';

/** Public state exposed to controls and tests. */
export type BackgroundState = 'loading' | 'playing' | 'paused' | 'blocked' | 'unavailable';

export function parseBackgroundPreference(raw: string | null | undefined): BackgroundPreference {
  return raw === 'paused' || raw === 'playing' ? raw : 'auto';
}

/**
 * Motion is allowed only when every gate passes. An explicit visitor choice wins over
 * device heuristics (it is the documented opt-in), but never over route/source gates.
 * `environment === null` means the browser has not been inspected yet (server render):
 * nothing is attached until it has.
 */
export function decideBackgroundPlayback(input: {
  preference: BackgroundPreference;
  environment: MotionEnvironment | null;
  routeMode: RouteMode;
  hasSources: boolean;
}): PlaybackDecision {
  const { preference, environment, routeMode, hasSources } = input;
  if (!hasSources) return { play: false, reason: 'no-sources' };
  if (routeMode === 'admin') return { play: false, reason: 'route' };
  if (preference === 'paused') return { play: false, reason: 'user-paused' };
  if (!environment) return { play: false, reason: 'pending' };
  if (preference === 'playing') return { play: true, reason: 'user-playing' };
  if (environment.reducedMotion) return { play: false, reason: 'reduced-motion' };
  if (environment.saveData) return { play: false, reason: 'save-data' };
  if (environment.slowConnection) return { play: false, reason: 'slow-connection' };
  if (environment.narrowCoarsePointer) return { play: false, reason: 'narrow-coarse' };
  return { play: true, reason: 'allowed' };
}

export function deriveBackgroundState(decision: PlaybackDecision, media: MediaStatus): BackgroundState {
  if (decision.reason === 'no-sources' || media === 'error') return 'unavailable';
  if (!decision.play) return 'paused';
  if (media === 'blocked') return 'blocked';
  if (media === 'playing') return 'playing';
  return 'loading';
}

/** Preference written when the visitor presses the background control; `null` = no-op. */
export function nextPreferenceOnToggle(state: BackgroundState): Exclude<BackgroundPreference, 'auto'> | null {
  if (state === 'playing' || state === 'loading') return 'paused';
  if (state === 'paused' || state === 'blocked') return 'playing';
  return null;
}

/** Clamped CSS `object-position` for a focal point. */
export function focalPointToObjectPosition(point: FocalPoint | undefined): string {
  const clamp = (value: number) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50);
  const { x, y } = point ?? DEFAULT_FOCAL_POINT;
  return `${clamp(x)}% ${clamp(y)}%`;
}

/** Connection types treated as slow; absence of the API never blocks motion. */
export function isSlowEffectiveType(effectiveType: string | undefined): boolean {
  return effectiveType === 'slow-2g' || effectiveType === '2g';
}
