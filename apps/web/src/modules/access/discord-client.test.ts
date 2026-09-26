import { describe, expect, it } from 'vitest';
import { fetchGuildMember, type DiscordClientConfig } from './discord-client';

const CONFIG: DiscordClientConfig = { apiBaseUrl: 'https://discord.test/api/v10/', botToken: 'synthetic-token', guildId: '100000000000000001' };
const USER = '300000000000000001';

type Step = Response | Error;

function sequence(steps: Step[], seen: Array<{ url: string; init?: RequestInit }> = []) {
  let index = 0;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), init });
    const step = steps[Math.min(index, steps.length - 1)]!;
    index += 1;
    if (step instanceof Error) throw step;
    return step.clone();
  }) as typeof fetch;
}

function fakeClock(start = 1_700_000_000_000) {
  let now = start;
  const waits: number[] = [];
  return {
    now: () => new Date(now),
    sleep: async (ms: number) => {
      waits.push(ms);
      now += ms;
    },
    waits,
  };
}

describe('fetchGuildMember', () => {
  it('returns authoritative role IDs with the bot token and the configured guild only', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const clock = fakeClock();
    const result = await fetchGuildMember(CONFIG, USER, {
      fetchImpl: sequence([Response.json({ user: { id: USER }, roles: ['200000000000000002', '200000000000000002'] })], seen),
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result).toEqual({ kind: 'member', roleIds: ['200000000000000002'], observedAt: clock.now() });
    expect(seen[0]!.url).toBe(`https://discord.test/api/v10/guilds/${CONFIG.guildId}/members/${USER}`);
    expect(new Headers(seen[0]!.init?.headers).get('authorization')).toBe('Bot synthetic-token');
  });

  it('treats 404 Unknown Member as not a member', async () => {
    const result = await fetchGuildMember(CONFIG, USER, { fetchImpl: sequence([Response.json({ code: 10007 }, { status: 404 })]) });
    expect(result.kind).toBe('not_member');
  });

  it('never treats an unknown guild as a departure', async () => {
    const result = await fetchGuildMember(CONFIG, USER, { fetchImpl: sequence([Response.json({ code: 10004 }, { status: 404 })]) });
    expect(result).toEqual({ kind: 'failure', code: 'unavailable' });
  });

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ] as const)('maps HTTP %i to failure %s (never zero roles)', async (status, code) => {
    const clock = fakeClock();
    const result = await fetchGuildMember(CONFIG, USER, {
      fetchImpl: sequence([new Response('{}', { status })]),
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result).toEqual({ kind: 'failure', code });
  });

  it('honours Retry-After on 429 and succeeds within the budget', async () => {
    const clock = fakeClock();
    const result = await fetchGuildMember(CONFIG, USER, {
      fetchImpl: sequence([
        new Response(JSON.stringify({ retry_after: 0.25 }), { status: 429, headers: { 'Retry-After': '0.25' } }),
        Response.json({ roles: [] }),
      ]),
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(clock.waits).toEqual([250]);
    expect(result.kind).toBe('member');
  });

  it('uses the JSON retry_after when the header is absent', async () => {
    const clock = fakeClock();
    await fetchGuildMember(CONFIG, USER, {
      fetchImpl: sequence([Response.json({ retry_after: 1.5 }, { status: 429 }), Response.json({ roles: [] })]),
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(clock.waits).toEqual([1500]);
  });

  it('fails fast when Retry-After exceeds the total budget', async () => {
    const clock = fakeClock();
    const result = await fetchGuildMember(CONFIG, USER, {
      fetchImpl: sequence([new Response('{}', { status: 429, headers: { 'Retry-After': '30' } })]),
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result).toEqual({ kind: 'failure', code: 'rate_limited' });
    expect(clock.waits).toEqual([]);
  });

  it('bounds retries for repeated 429 responses', async () => {
    const clock = fakeClock();
    const seen: Array<{ url: string }> = [];
    const result = await fetchGuildMember(CONFIG, USER, {
      fetchImpl: sequence([new Response('{}', { status: 429, headers: { 'Retry-After': '1' } })], seen),
      now: clock.now,
      sleep: clock.sleep,
      maxAttempts: 3,
    });
    expect(result).toEqual({ kind: 'failure', code: 'rate_limited' });
    expect(seen).toHaveLength(3);
    expect(clock.waits.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(5_000);
  });

  it('reports timeouts and network errors as failures', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const clock = fakeClock();
    expect(await fetchGuildMember(CONFIG, USER, { fetchImpl: sequence([timeout]), now: clock.now, sleep: clock.sleep })).toEqual({
      kind: 'failure',
      code: 'timeout',
    });
    expect(await fetchGuildMember(CONFIG, USER, { fetchImpl: sequence([new TypeError('fetch failed')]), now: clock.now, sleep: clock.sleep })).toEqual({
      kind: 'failure',
      code: 'unavailable',
    });
  });

  it('rejects malformed or mismatched member payloads', async () => {
    expect(await fetchGuildMember(CONFIG, USER, { fetchImpl: sequence([Response.json({ roles: 'admin' })]) })).toEqual({
      kind: 'failure',
      code: 'invalid_response',
    });
    expect(await fetchGuildMember(CONFIG, USER, { fetchImpl: sequence([Response.json({ roles: [], user: { id: '300000000000000999' } })]) })).toEqual({
      kind: 'failure',
      code: 'invalid_response',
    });
  });

  it('does not call Discord without guild/bot configuration', async () => {
    const seen: Array<{ url: string }> = [];
    const result = await fetchGuildMember({ ...CONFIG, botToken: undefined }, USER, { fetchImpl: sequence([Response.json({ roles: [] })], seen) });
    expect(result).toEqual({ kind: 'failure', code: 'not_configured' });
    expect(seen).toHaveLength(0);
  });
});
