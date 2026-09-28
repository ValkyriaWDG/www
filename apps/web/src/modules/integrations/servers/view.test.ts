import { describe, expect, it } from 'vitest';
import { classifyFreshness, SERVER_FRESHNESS, sourceKey, type ServerSnapshot } from '../contract';
import { parseServerParam, populationParts, resolveSelection } from './view';

const server = (publicId: string, patch: Partial<ServerSnapshot> = {}): ServerSnapshot => ({
  ref: { source: 'synthetic', sourceInstanceId: 'synthetic', guildId: null, game: 'hll', kind: 'server', externalId: publicId },
  publicId,
  name: publicId,
  reachability: 'online',
  map: null,
  mode: null,
  players: null,
  capacity: null,
  nextMap: null,
  timeRemainingSeconds: null,
  score: null,
  teams: null,
  observedAt: null,
  freshness: 'unavailable',
  connect: { kind: 'none' },
  statsUrl: null,
  ...patch,
});

describe('server freshness', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  it('classifies current, stale and expired observations', () => {
    expect(classifyFreshness(new Date('2026-09-28T11:59:00Z'), now, SERVER_FRESHNESS)).toBe('fresh');
    expect(classifyFreshness(new Date('2026-09-28T11:45:00Z'), now, SERVER_FRESHNESS)).toBe('stale');
    expect(classifyFreshness(new Date('2026-09-28T11:00:00Z'), now, SERVER_FRESHNESS)).toBe('unavailable');
  });
  it('never treats a missing or future timestamp as current', () => {
    expect(classifyFreshness(null, now, SERVER_FRESHNESS)).toBe('unavailable');
    expect(classifyFreshness(new Date('2026-09-28T12:05:00Z'), now, SERVER_FRESHNESS)).toBe('unavailable');
    expect(classifyFreshness(new Date('invalid'), now, SERVER_FRESHNESS)).toBe('unavailable');
  });
});

describe('server selection and values', () => {
  it('accepts only public slug IDs', () => {
    expect(parseServerParam('synthetic-alpha')).toBe('synthetic-alpha');
    expect(parseServerParam('../admin')).toBeNull();
    expect(parseServerParam('<b>')).toBeNull();
    expect(parseServerParam(undefined)).toBeNull();
  });
  it('distinguishes no selection, a selected server and a removed one', () => {
    const servers = [server('alpha'), server('bravo')];
    expect(resolveSelection(servers, null)).toEqual({ kind: 'none' });
    expect(resolveSelection(servers, 'bravo')).toMatchObject({ kind: 'selected', server: { publicId: 'bravo' } });
    expect(resolveSelection(servers, 'gone')).toEqual({ kind: 'missing' });
  });
  it('keeps unknown population values unknown instead of zero', () => {
    expect(populationParts(server('a'))).toBeNull();
    expect(populationParts(server('a', { capacity: 100 }))).toEqual({ players: null, capacity: 100 });
    expect(populationParts(server('a', { players: 0, capacity: 100 }))).toEqual({ players: 0, capacity: 100 });
  });
  it('builds game-scoped source keys and rejects unsafe parts', () => {
    expect(sourceKey(server('alpha').ref)).toBe('synthetic/synthetic/-/hll/server/alpha');
    expect(() => sourceKey({ ...server('alpha').ref, externalId: 'a/../b' })).toThrow();
  });
});
