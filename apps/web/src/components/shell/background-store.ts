import { useSyncExternalStore } from 'react';
import { usePathname } from '@/i18n/navigation';
import {
  BACKGROUND_STORAGE_KEY,
  type BackgroundPreference,
  type BackgroundState,
  decideBackgroundPlayback,
  deriveBackgroundState,
  isSlowEffectiveType,
  type MediaStatus,
  type MotionEnvironment,
  nextPreferenceOnToggle,
  parseBackgroundPreference,
  type PlaybackDecision,
} from './background-policy';
import { getRouteMode, type RouteMode } from './route-mode';

/**
 * Browser-side background state shared by the persistent scene and its controls. It is a
 * module singleton (one per tab) so the preference and media status survive route
 * changes without remounting the video. Nothing here runs or mutates on the server.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((listener) => listener());
function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- Visitor preference (localStorage, tolerant of blocked storage) ----
let preference: BackgroundPreference | null = null;

function readPreference(): BackgroundPreference {
  if (preference === null) {
    try {
      preference = parseBackgroundPreference(window.localStorage.getItem(BACKGROUND_STORAGE_KEY));
    } catch {
      preference = 'auto';
    }
  }
  return preference;
}

export function setBackgroundPreference(value: BackgroundPreference): void {
  preference = value;
  try {
    if (value === 'auto') window.localStorage.removeItem(BACKGROUND_STORAGE_KEY);
    else window.localStorage.setItem(BACKGROUND_STORAGE_KEY, value);
  } catch {
    // Storage may be unavailable (private mode); the in-memory choice still applies.
  }
  emit();
}

function subscribePreference(listener: Listener): () => void {
  const unsubscribe = subscribe(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== BACKGROUND_STORAGE_KEY) return;
    preference = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    unsubscribe();
    window.removeEventListener('storage', onStorage);
  };
}

// ---- Motion environment (reduced motion and connection hints are live) ----
type NetworkInformationLike = EventTarget & { saveData?: boolean; effectiveType?: string };
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const NARROW_COARSE_QUERY = '(max-width: 767px) and (pointer: coarse)';

let environment: MotionEnvironment | null = null;
let environmentKey = '';
// Evaluated once: rotating a phone must not suddenly start a download.
let initialNarrowCoarse: boolean | null = null;

function connection(): NetworkInformationLike | undefined {
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

function readEnvironment(): MotionEnvironment {
  if (initialNarrowCoarse === null) initialNarrowCoarse = window.matchMedia(NARROW_COARSE_QUERY).matches;
  const info = connection();
  const next: MotionEnvironment = {
    reducedMotion: window.matchMedia(REDUCED_MOTION_QUERY).matches,
    saveData: info?.saveData === true,
    slowConnection: isSlowEffectiveType(info?.effectiveType),
    narrowCoarsePointer: initialNarrowCoarse,
  };
  const key = `${+next.reducedMotion}${+next.saveData}${+next.slowConnection}${+next.narrowCoarsePointer}`;
  if (!environment || key !== environmentKey) {
    environment = next;
    environmentKey = key;
  }
  return environment;
}

function subscribeEnvironment(listener: Listener): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  const info = connection();
  const onMotion = () => {
    // A newly enabled reduced-motion preference ends an earlier explicit "play" choice
    // (for both game sections); the visitor can opt in again deliberately.
    if (query.matches && readPreference() === 'playing') setBackgroundPreference('auto');
    listener();
  };
  query.addEventListener('change', onMotion);
  info?.addEventListener?.('change', listener);
  return () => {
    query.removeEventListener('change', onMotion);
    info?.removeEventListener?.('change', listener);
  };
}

// ---- Media status reported by the video element ----
let mediaStatus: MediaStatus = 'idle';

export function getMediaStatus(): MediaStatus {
  return mediaStatus;
}

export function setMediaStatus(value: MediaStatus): void {
  if (mediaStatus === value) return;
  mediaStatus = value;
  emit();
}

// ---- Imperative controller registered by <BackgroundMedia> ----
type Controller = { play: () => void; pause: () => void };
let controller: Controller | null = null;

export function registerBackgroundController(value: Controller): () => void {
  controller = value;
  return () => {
    if (controller === value) controller = null;
  };
}

/** Called from the control's click handler so `play()` runs inside the user gesture. */
export function toggleBackground(state: BackgroundState): void {
  const next = nextPreferenceOnToggle(state);
  if (!next) return;
  setBackgroundPreference(next);
  if (next === 'paused') controller?.pause();
  else {
    setMediaStatus('loading');
    controller?.play();
  }
}

const serverPreference = (): BackgroundPreference => 'auto';

/**
 * Global motion inputs shared by every game section: the visitor's explicit choice and
 * the live device/connection environment (`null` during server render).
 */
export function useMotionInputs(): { preference: BackgroundPreference; environment: MotionEnvironment | null } {
  const preference = useSyncExternalStore(subscribePreference, readPreference, serverPreference);
  const environment = useSyncExternalStore(subscribeEnvironment, readEnvironment, serverEnvironment);
  return { preference, environment };
}
const serverEnvironment = (): MotionEnvironment | null => null;
const serverMediaStatus = (): MediaStatus => 'idle';

/** Shared derived state for the scene and its controls. */
export function useBackgroundPlayback(hasSources: boolean): {
  decision: PlaybackDecision;
  state: BackgroundState;
  routeMode: RouteMode;
} {
  const currentPreference = useSyncExternalStore(subscribePreference, readPreference, serverPreference);
  const currentEnvironment = useSyncExternalStore(subscribeEnvironment, readEnvironment, serverEnvironment);
  const media = useSyncExternalStore(subscribe, getMediaStatus, serverMediaStatus);
  const routeMode = getRouteMode(usePathname());
  const decision = decideBackgroundPlayback({
    preference: currentPreference,
    environment: currentEnvironment,
    routeMode,
    hasSources,
  });
  return { decision, state: deriveBackgroundState(decision, media), routeMode };
}
