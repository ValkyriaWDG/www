import { describe, expect, it } from 'vitest';
import {
  decideBackgroundPlayback,
  deriveBackgroundState,
  focalPointToObjectPosition,
  isSlowEffectiveType,
  isVideoLayerVisible,
  type MotionEnvironment,
  nextPreferenceOnToggle,
  parseBackgroundPreference,
} from './background-policy';

const calm: MotionEnvironment = { reducedMotion: false, saveData: false, slowConnection: false, narrowCoarsePointer: false };
const base = { preference: 'auto' as const, environment: calm, routeMode: 'home' as const, hasSources: true };

describe('decideBackgroundPlayback', () => {
  it('plays on a capable desktop with default preference', () => {
    expect(decideBackgroundPlayback(base)).toEqual({ play: true, reason: 'allowed' });
  });

  it('never plays (or attaches) without configured sources', () => {
    expect(decideBackgroundPlayback({ ...base, hasSources: false, preference: 'playing' })).toEqual({ play: false, reason: 'no-sources' });
  });

  it('keeps admin routes static even after an explicit play choice', () => {
    expect(decideBackgroundPlayback({ ...base, routeMode: 'admin', preference: 'playing' })).toEqual({ play: false, reason: 'route' });
  });

  it('plays on public subpages when allowed', () => {
    expect(decideBackgroundPlayback({ ...base, routeMode: 'public' }).play).toBe(true);
  });

  it('waits for the browser environment before attaching anything (server render)', () => {
    expect(decideBackgroundPlayback({ ...base, environment: null })).toEqual({ play: false, reason: 'pending' });
  });

  it.each([
    ['reduced-motion', { reducedMotion: true }],
    ['save-data', { saveData: true }],
    ['slow-connection', { slowConnection: true }],
    ['narrow-coarse', { narrowCoarsePointer: true }],
  ] as const)('starts poster-only for %s by default', (reason, override) => {
    expect(decideBackgroundPlayback({ ...base, environment: { ...calm, ...override } })).toEqual({ play: false, reason });
  });

  it('reports reduced motion before other device hints', () => {
    const environment = { reducedMotion: true, saveData: true, slowConnection: true, narrowCoarsePointer: true };
    expect(decideBackgroundPlayback({ ...base, environment }).reason).toBe('reduced-motion');
  });

  it('honours an explicit opt-in over device hints', () => {
    const environment = { reducedMotion: true, saveData: true, slowConnection: false, narrowCoarsePointer: true };
    expect(decideBackgroundPlayback({ ...base, environment, preference: 'playing' })).toEqual({ play: true, reason: 'user-playing' });
  });

  it('honours an explicit pause on every route', () => {
    expect(decideBackgroundPlayback({ ...base, preference: 'paused' })).toEqual({ play: false, reason: 'user-paused' });
    expect(decideBackgroundPlayback({ ...base, preference: 'paused', routeMode: 'public' }).play).toBe(false);
  });
});

describe('deriveBackgroundState', () => {
  const allowed = { play: true, reason: 'allowed' } as const;
  it('maps media progress while playback is allowed', () => {
    expect(deriveBackgroundState(allowed, 'idle')).toBe('loading');
    expect(deriveBackgroundState(allowed, 'loading')).toBe('loading');
    expect(deriveBackgroundState(allowed, 'playing')).toBe('playing');
    expect(deriveBackgroundState(allowed, 'blocked')).toBe('blocked');
  });

  it('treats media errors and missing sources as unavailable (poster stays)', () => {
    expect(deriveBackgroundState(allowed, 'error')).toBe('unavailable');
    expect(deriveBackgroundState({ play: false, reason: 'no-sources' }, 'idle')).toBe('unavailable');
  });

  it('is paused whenever the policy withholds motion', () => {
    expect(deriveBackgroundState({ play: false, reason: 'reduced-motion' }, 'playing')).toBe('paused');
    expect(deriveBackgroundState({ play: false, reason: 'user-paused' }, 'blocked')).toBe('paused');
  });
});

describe('nextPreferenceOnToggle', () => {
  it('pauses running media and opts in otherwise', () => {
    expect(nextPreferenceOnToggle('playing')).toBe('paused');
    expect(nextPreferenceOnToggle('loading')).toBe('paused');
    expect(nextPreferenceOnToggle('paused')).toBe('playing');
    expect(nextPreferenceOnToggle('blocked')).toBe('playing');
    expect(nextPreferenceOnToggle('unavailable')).toBeNull();
  });
});

describe('helpers', () => {
  it('parses stored preferences defensively', () => {
    expect(parseBackgroundPreference('paused')).toBe('paused');
    expect(parseBackgroundPreference('playing')).toBe('playing');
    expect(parseBackgroundPreference('PAUSED')).toBe('auto');
    expect(parseBackgroundPreference(null)).toBe('auto');
  });

  it('clamps focal points into a CSS object-position', () => {
    expect(focalPointToObjectPosition(undefined)).toBe('50% 50%');
    expect(focalPointToObjectPosition({ x: 30, y: 70 })).toBe('30% 70%');
    expect(focalPointToObjectPosition({ x: -10, y: 140 })).toBe('0% 100%');
    expect(focalPointToObjectPosition({ x: Number.NaN, y: 20 })).toBe('50% 20%');
  });

  it('flags only very slow effective connection types', () => {
    expect(isSlowEffectiveType('2g')).toBe(true);
    expect(isSlowEffectiveType('slow-2g')).toBe(true);
    expect(isSlowEffectiveType('4g')).toBe(false);
    expect(isSlowEffectiveType(undefined)).toBe(false);
  });
});

describe('isVideoLayerVisible', () => {
  it('shows the video while playing and keeps its frame through a rebuffer after the first frame', () => {
    expect(isVideoLayerVisible('playing', false)).toBe(true);
    expect(isVideoLayerVisible('playing', true)).toBe(true);
    expect(isVideoLayerVisible('loading', true)).toBe(true);
  });

  it('keeps the poster before the first frame and whenever motion is not running', () => {
    expect(isVideoLayerVisible('loading', false)).toBe(false);
    for (const state of ['paused', 'blocked', 'unavailable'] as const) {
      expect(isVideoLayerVisible(state, true)).toBe(false);
      expect(isVideoLayerVisible(state, false)).toBe(false);
    }
  });
});
