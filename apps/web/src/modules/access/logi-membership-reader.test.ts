import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuredLogiSources } from '@/modules/integrations/logi-config';
import type { LogiMembership } from '@/modules/integrations/logi/contracts';
import { readLogiMemberships } from './logi-membership-reader';

const now = new Date('2026-10-04T12:00:00Z');
const subject = '300000000000000001';
const guildId = '100000000000000001';
const sources = configuredLogiSources({
  LOGI_SOURCES_JSON: JSON.stringify(['hell_let_loose', 'wardogs'].map((gameId) => ({ sourceInstanceId: `synthetic-${gameId}`, gameId, guildId, origin: 'https://logi.example.test' }))),
  LOGI_MEMBERSHIP_API_KEY_HLL: 'synthetic-hll-restricted-key', LOGI_MEMBERSHIP_API_KEY_WDG: 'synthetic-wdg-restricted-key',
}, 'membership');
const member = (gameId: LogiMembership['gameId'], state: LogiMembership['state'] = 'present'): LogiMembership => ({
  guildId, discordUserId: subject, gameId, state, assignment: null,
  roleIds: state === 'present' ? ['200000000000000001'] : [],
  observedAt: state === 'unknown' ? null : now.toISOString(), receivedAt: now.toISOString(), epoch: '1', revision: '1',
  completeness: state === 'present' ? 'verified_member' : state === 'left' ? 'verified_absent' : 'unavailable',
});
const input = { sources, subject, maxAgeMs: 60_000, now: () => now };
afterEach(() => vi.useRealTimers());

describe('cross-game membership refresh', () => {
  it('waits for the sibling refresh before rechecking its initially unavailable game with that game grant', async () => {
    let release!: () => void;
    const refreshed = new Promise<void>((resolve) => { release = resolve; });
    let refreshComplete = false;
    const calls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (raw, init) => {
      const url = new URL(String(raw));
      const game = url.searchParams.get('game') as LogiMembership['gameId'];
      calls.push(game);
      const source = sources.find((source) => source.gameId === game)!;
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${source.apiKey}`);
      expect(url.searchParams.get('maxAgeMs')).toBe('60000');
      if (game === 'hell_let_loose') { await refreshed; refreshComplete = true; }
      return Response.json({ data: member(game, game === 'wardogs' && !refreshComplete ? 'unknown' : 'present') });
    });
    const pending = readLogiMemberships({ ...input, fetchImpl });
    await vi.waitFor(() => expect(calls).toEqual(['hell_let_loose', 'wardogs']));
    release();
    expect((await pending).map((row) => row.state)).toEqual(['present', 'present']);
    expect(calls).toEqual(['hell_let_loose', 'wardogs', 'wardogs']);
    await readLogiMemberships({ ...input, fetchImpl });
    expect(calls).toHaveLength(5); // No completed observation reused by the next request.
  });

  it('rechecks each unavailable game at most once and leaves continued failure unknown', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (raw) => Response.json({ data: member(new URL(String(raw)).searchParams.get('game') as LogiMembership['gameId'], 'unknown') }));
    expect((await readLogiMemberships({ ...input, fetchImpl })).every((row) => row.state === 'unknown' && row.roleIds.length === 0)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not retry verified absence or a verified member with no allowed roles', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (raw) => {
      const game = new URL(String(raw)).searchParams.get('game') as LogiMembership['gameId'];
      return Response.json({ data: { ...member(game, game === 'wardogs' ? 'left' : 'present'), roleIds: [] } });
    });
    expect((await readLogiMemberships({ ...input, fetchImpl })).map((row) => row.state)).toEqual(['present', 'left']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([[401, 'unauthorized'], [403, 'forbidden'], [429, 'rate_limited'], [503, 'upstream']] as const)('does not retry HTTP %s as a shared-refresh collision', async (status, code) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status, headers: { 'Retry-After': '30' } }));
    await expect(readLogiMemberships({ ...input, sources: [sources[0]!], fetchImpl })).rejects.toMatchObject({ code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('still rejects a fresh response for another subject', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ data: { ...member('hell_let_loose'), discordUserId: '300000000000000002' } }));
    await expect(readLogiMemberships({ ...input, sources: [sources[0]!], fetchImpl })).rejects.toMatchObject({ code: 'scope_mismatch' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cannot refresh authority by rereading an unchanged stale observation', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ data: { ...member('hell_let_loose'), observedAt: new Date(now.getTime() - 60_001).toISOString() } }));
    expect(await readLogiMemberships({ ...input, sources: [sources[0]!], fetchImpl })).toMatchObject([{ state: 'unknown', roleIds: [] }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retains the four-second timeout and does not retry transport failures', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    const pending = readLogiMemberships({ ...input, sources: [sources[0]!], fetchImpl });
    const denied = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(4_000);
    await denied;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
