import { type NavigationKind, resolveInitialClip } from '@/modules/hll/media';
import { registerNavigationHandoff } from '@/components/shell/navigation-handoff';

/**
 * Browser-lifetime HLL stage selection. A module singleton survives client navigation,
 * locale/game switches back to HLL, re-renders and BFCache restores; a fresh document
 * (reload or new opening) evaluates the set again. The rendition profile and playback
 * position are remembered with the selection so returning resumes the same clip.
 */

const STORED_KEY = 'valkyria.hll.clip';
const HANDOFF_KEY = 'valkyria.hll.clip-handoff';

type Selection = { id: string | null; source: 'handoff' | 'history' | 'random' | 'removed'; compact: boolean };

let selection: Selection | null = null;
let savedTime = 0;
let unregister: (() => void) | null = null;

function navigationKind(): NavigationKind {
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const type = entry?.type;
    return type === 'navigate' || type === 'reload' || type === 'back_forward' || type === 'prerender' ? type : 'unknown';
  } catch {
    return 'unknown';
  }
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable; the in-memory selection still applies for this document.
  }
}

function readHandoff(): { id: string; at: number } | null {
  const raw = readSession(HANDOFF_KEY);
  writeSession(HANDOFF_KEY, null);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { id?: unknown; at?: unknown };
    return typeof value.id === 'string' && typeof value.at === 'number' ? { id: value.id, at: value.at } : null;
  } catch {
    return null;
  }
}

/** Selection for this document, made once after hydration (never during server render). */
export function getStageSelection(ids: readonly string[]): Selection {
  if (selection) return selection;
  const resolved = resolveInitialClip({
    ids,
    navigation: navigationKind(),
    stored: readSession(STORED_KEY),
    handoff: readHandoff(),
    now: Date.now(),
    random: Math.random(),
  });
  selection = { ...resolved, compact: window.matchMedia('(max-width: 767px)').matches };
  if (selection.id) writeSession(STORED_KEY, selection.id);
  unregister ??= registerNavigationHandoff(() => {
    if (selection?.id) writeSession(HANDOFF_KEY, JSON.stringify({ id: selection.id, at: Date.now() }));
  });
  return selection;
}

export function getSavedTime(): number {
  return savedTime;
}

export function setSavedTime(value: number): void {
  if (Number.isFinite(value) && value >= 0) savedTime = value;
}
