import { describe, expect, it } from 'vitest';
import { CLIP_HANDOFF_TTL_MS, chooseRendition, parseHllClipConfig, pickClipId, resolveInitialClip, type HllClip } from './media';

const ORIGIN = 'https://media.example.test';

function clipJson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'synthetic-a',
    enabled: true,
    provenance: 'Synthetic test pattern generated for automated tests',
    rights: 'Test-only, no public use',
    posterUrl: '/e2e-media/synthetic-a.webp',
    durationSeconds: 12,
    renditions: [
      { src: '/e2e-media/synthetic-a-720.webm', type: 'video/webm', width: 1280, height: 720, bytes: 100_000, profile: 'desktop' },
      { src: '/e2e-media/synthetic-a-360.webm', type: 'video/webm', width: 640, height: 360, bytes: 40_000, profile: 'compact' },
    ],
    ...overrides,
  };
}

describe('HLL clip configuration', () => {
  it('defaults to an empty set (static fallback) and rejects malformed JSON', () => {
    expect(parseHllClipConfig('[]', [])).toEqual({ clips: [], error: null });
    expect(parseHllClipConfig('', [])).toEqual({ clips: [], error: null });
    expect(parseHllClipConfig('{not json', [])).toEqual({ clips: [], error: 'invalid_json' });
  });

  it('serves only enabled clips and strips review records from the browser DTO', () => {
    const { clips, error } = parseHllClipConfig(JSON.stringify([clipJson(), clipJson({ id: 'disabled-b', enabled: false })]), []);
    expect(error).toBeNull();
    expect(clips.map((clip) => clip.id)).toEqual(['synthetic-a']);
    expect(clips[0]).not.toHaveProperty('provenance');
    expect(clips[0]).not.toHaveProperty('rights');
  });

  it('rejects the whole set when any clip lacks provenance, rights or a valid source', () => {
    const invalid = [
      clipJson({ provenance: '' }),
      clipJson({ rights: undefined }),
      clipJson({ renditions: [] }),
      clipJson({ renditions: [{ src: 'http://insecure.example/a.webm', type: 'video/webm', width: 1, height: 1, bytes: 1, profile: 'desktop' }] }),
      clipJson({ renditions: [{ src: '//protocol-relative.example/a.webm', type: 'video/webm', width: 1, height: 1, bytes: 1, profile: 'desktop' }] }),
      clipJson({ renditions: [{ src: `${ORIGIN}/a.webm`, type: 'video/avi', width: 1, height: 1, bytes: 1, profile: 'desktop' }] }),
      clipJson({ posterUrl: 'https://user:pass@media.example.test/p.webp' }),
    ];
    for (const clip of invalid) expect(parseHllClipConfig(JSON.stringify([clip]), [ORIGIN])).toEqual({ clips: [], error: 'invalid_config' });
    expect(parseHllClipConfig(JSON.stringify([clipJson(), clipJson()]), [])).toEqual({ clips: [], error: 'invalid_config' });
  });

  it('accepts HTTPS media only on an allowlisted origin', () => {
    const remote = clipJson({ renditions: [{ src: `${ORIGIN}/a.webm`, type: 'video/webm', width: 1920, height: 1080, bytes: 1, profile: 'desktop' }] });
    expect(parseHllClipConfig(JSON.stringify([remote]), [ORIGIN]).clips).toHaveLength(1);
    expect(parseHllClipConfig(JSON.stringify([remote]), ['https://other.example.test']).clips).toHaveLength(0);
  });
});

describe('HLL clip selection lifecycle', () => {
  const ids = ['a', 'b', 'c'];
  const now = 1_000_000;

  it('picks uniformly within the enabled set and nothing from an empty set', () => {
    expect(pickClipId([], 0.5)).toBeNull();
    expect(pickClipId(['only'], 0.99)).toBe('only');
    expect(pickClipId(ids, 0)).toBe('a');
    expect(pickClipId(ids, 0.34)).toBe('b');
    expect(pickClipId(ids, 0.999999)).toBe('c');
    expect(pickClipId(ids, 1)).toBe('c');
  });

  it('selects anew on a fresh opening or reload, even with a stored selection', () => {
    expect(resolveInitialClip({ ids, navigation: 'navigate', stored: 'a', handoff: null, now, random: 0.9 })).toEqual({ id: 'c', source: 'random' });
    expect(resolveInitialClip({ ids, navigation: 'reload', stored: 'a', handoff: { id: 'a', at: now }, now, random: 0.4 })).toEqual({ id: 'b', source: 'random' });
  });

  it('keeps the selection across a language switch handoff and history traversal', () => {
    expect(resolveInitialClip({ ids, navigation: 'navigate', stored: null, handoff: { id: 'b', at: now - 1000 }, now, random: 0 })).toEqual({ id: 'b', source: 'handoff' });
    expect(resolveInitialClip({ ids, navigation: 'back_forward', stored: 'c', handoff: null, now, random: 0 })).toEqual({ id: 'c', source: 'history' });
  });

  it('ignores an expired handoff and never reselects a removed clip', () => {
    expect(resolveInitialClip({ ids, navigation: 'navigate', stored: null, handoff: { id: 'b', at: now - CLIP_HANDOFF_TTL_MS - 1 }, now, random: 0 })).toEqual({ id: 'a', source: 'random' });
    expect(resolveInitialClip({ ids, navigation: 'back_forward', stored: 'gone', handoff: null, now, random: 0 })).toEqual({ id: null, source: 'removed' });
    expect(resolveInitialClip({ ids: [], navigation: 'navigate', stored: null, handoff: null, now, random: 0 })).toEqual({ id: null, source: 'random' });
  });

  it('chooses one rendition per profile and at most skips a failed source', () => {
    const { clips } = parseHllClipConfig(JSON.stringify([clipJson()]), []);
    const clip = clips[0] as HllClip;
    const webm = (type: string) => type === 'video/webm';
    expect(chooseRendition(clip, false, webm)?.profile).toBe('desktop');
    expect(chooseRendition(clip, true, webm)?.profile).toBe('compact');
    expect(chooseRendition(clip, false, webm, ['/e2e-media/synthetic-a-720.webm'])?.profile).toBe('compact');
    expect(chooseRendition(clip, false, () => false)).toBeNull();
  });
});
