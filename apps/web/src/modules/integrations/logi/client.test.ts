import { describe, expect, it, vi } from 'vitest';
import { createLogiClient, LogiClientError, logiRetryAfterMs, validateLogiOrigin, type LogiClientConfig, type LogiFetch } from './client';
import { logiResourceSchemas, logiResultSummarySchema, logiServerSnapshotSchema } from './contracts';
import eventFixtures from './fixtures/v0.4.json';
import serverFixtures from './fixtures/v0.5.json';
import syncFixtures from './fixtures/v0.6.json';
import memberFixtures from './fixtures/v0.7.json';
import unknown from './fixtures/result-unknown.json';
import provisional from './fixtures/result-provisional.json';
import confirmed from './fixtures/result-confirmed.json';
import corrected from './fixtures/result-corrected.json';
import factions from './fixtures/result-wardogs-factions.json';

const config: LogiClientConfig = {
  origin: 'https://logi.example', apiKey: 'synthetic-key-not-a-credential', sourceInstanceId: 'fixture-instance', guildId: 'fixture-guild-a', gameId: 'wardogs',
  resources: ['event-summaries', 'match-summaries', 'result-summaries', 'server-snapshots', 'integration-health'],
};
const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);
function setup(body: unknown, patch: Partial<LogiClientConfig> = {}) {
  const fetchImpl = vi.fn<LogiFetch>().mockImplementation(async () => json(body));
  return { client: createLogiClient({ ...config, ...patch }, { fetchImpl }), fetchImpl };
}
const listBody = { data: [syncFixtures.record.data.data], page: { nextCursor: null, limit: 25 } };

describe('current producer match team summaries', () => {
  const team = {
    teamId: 'synthetic-team', slot: 'a', side: 'Valkyra', name: 'Synthetic team',
    shortCode: 'SYN', logoUrl: 'https://assets.example/team.png', teamRevision: 2,
    capturedAt: '2026-10-04T12:00:00Z',
  };
  function row(resource: 'event-summaries' | 'match-summaries', matchTeams: unknown) {
    const event = listBody.data[0]!;
    return resource === 'event-summaries' ? { ...event, matchTeams } : {
      id: event.id, guildId: event.guildId, gameId: event.gameId, title: event.title,
      updatedAt: event.updatedAt, eventId: event.id, resultState: 'unknown', result: null, matchTeams,
    };
  }

  it.each(['event-summaries', 'match-summaries'] as const)('accepts null, empty and captured teams in %s lists and atomic records', async (resource) => {
    for (const matchTeams of [null, [], [team]]) {
      const data = row(resource, matchTeams);
      const page = { ...listBody, data: [data] };
      await expect(setup(page).client.list(resource)).resolves.toEqual(page);
      const atomic = { data: { ...syncFixtures.record.data, resource, data } };
      await expect(setup(atomic).client.syncRecord(resource, data.id)).resolves.toEqual(atomic.data);
    }
  });

  it.each([
    [team, team, team, team],
    [{ ...team, discordUserId: 'synthetic-private-member' }],
    [{ ...team, logoUrl: 'javascript:alert(1)' }],
    [{ ...team, logoUrl: 'not-a-url' }],
    [{ ...team, logoUrl: 'https://user:password@assets.example/team.png' }],
    [{ ...team, capturedAt: 'tomorrow' }],
    [{ ...team, teamRevision: 0 }],
    [{ ...team, name: 'x'.repeat(121) }],
  ])('rejects malformed or private team metadata', async (...matchTeams) => {
    await expect(setup({ ...listBody, data: [row('event-summaries', matchTeams)] }).client.list('event-summaries')).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('closed producer contracts', () => {
  it('accepts the actual versioned event and match fixture bodies', () => {
    let checked = 0;
    for (const response of eventFixtures.responses) {
      if (response.status !== 200) continue;
      const resource = response.request.includes('/match-summaries') ? 'match-summaries' : 'event-summaries';
      const body = response.body as { data: unknown };
      for (const row of Array.isArray(body.data) ? body.data : [body.data]) {
        expect(logiResourceSchemas[resource].safeParse(row).success).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });

  it('accepts producer snapshots, collector health and all reviewed result states', () => {
    for (const row of serverFixtures.snapshots.data) expect(logiServerSnapshotSchema.safeParse(row).success).toBe(true);
    for (const row of serverFixtures.health.data) expect(logiResourceSchemas['integration-health'].safeParse(row).success).toBe(true);
    for (const fixture of [unknown, provisional, confirmed, corrected, factions]) {
      const parsed = logiResultSummarySchema.parse(fixture.data);
      expect(parsed.resultState).toBe(fixture.data.resultState);
    }
    expect(logiResultSummarySchema.parse(factions.data).result?.participants).toHaveLength(3);
    expect(logiResultSummarySchema.parse(provisional.data).result?.participants.map((row) => row.score)).toEqual([0, null]);
  });

  it('rejects extra private fields and contradictory result identity/state', () => {
    expect(logiResourceSchemas['event-summaries'].safeParse({ ...listBody.data[0], password: 'do-not-project' }).success).toBe(false);
    expect(logiResultSummarySchema.safeParse({ ...confirmed.data, eventId: 'another-event' }).success).toBe(false);
    expect(logiResultSummarySchema.safeParse({ ...confirmed.data, resultState: 'unknown' }).success).toBe(false);
    expect(logiResultSummarySchema.safeParse({ ...confirmed.data, result: { ...confirmed.data.result, reviewerId: 'private' } }).success).toBe(false);
  });
});

describe('bounded server-only transport', () => {
  it('uses a fixed path, explicit game, no-store and no credentials/cookies from the caller', async () => {
    const { client, fetchImpl } = setup(listBody);
    await expect(client.list('event-summaries')).resolves.toEqual(listBody);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://logi.example/api/v1/clan/event-summaries?limit=25&game=wardogs');
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store' });
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${config.apiKey}`);
    expect(new Headers(init.headers).get('cookie')).toBeNull();
  });

  it.each(['http://logi.example', 'https://user:pass@logi.example', 'https://logi.example/api/v1', 'https://logi.example/?redirect=other', 'https://logi.example/#fragment'])('rejects unsafe configured origin %s', (origin) => {
    expect(() => createLogiClient({ ...config, origin })).toThrow(LogiClientError);
  });

  it('allows only explicit nonproduction loopback HTTP and never a production override', () => {
    expect(validateLogiOrigin('http://127.0.0.1:30158', { environment: 'test', allowLoopbackHttp: true })).toBe('http://127.0.0.1:30158');
    expect(() => validateLogiOrigin('http://127.0.0.1:30158', { environment: 'production', allowLoopbackHttp: true })).toThrow();
    expect(() => validateLogiOrigin('http://127.0.0.1:30158', { environment: 'test' })).toThrow();
    expect(() => validateLogiOrigin('http://10.0.0.1', { environment: 'test', allowLoopbackHttp: true })).toThrow();
  });

  it('denies ungranted resources and unsafe identity paths before sending requests', async () => {
    const { client, fetchImpl } = setup(listBody, { resources: ['event-summaries'] });
    await expect(client.list('server-snapshots')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(client.syncRecord('event-summaries', '../settings')).rejects.toMatchObject({ code: 'configuration' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([{ guildId: 'foreign-guild' }, { gameId: 'hell_let_loose' }])('rejects foreign scope %j', async (patch) => {
    const { client } = setup({ ...listBody, data: [{ ...listBody.data[0], ...patch }] });
    await expect(client.list('event-summaries')).rejects.toMatchObject({ code: 'scope_mismatch' });
  });

  it('does not follow redirects or forward the bearer key to their destinations', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://other.example/collect' } }));
    await expect(createLogiClient(config, { fetchImpl }).list('event-summaries')).rejects.toMatchObject({ code: 'redirect' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([401, 403, 404, 410, 500])('classifies HTTP %s without leaking response text or retrying', async (status) => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(new Response('private provider details', { status }));
    const expected = { 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 410: 'reset_required', 500: 'upstream' }[status];
    await expect(createLogiClient(config, { fetchImpl }).list('event-summaries')).rejects.toMatchObject({ code: expected, message: `Logi request failed: ${expected}` });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('propagates 429 retry timing for the durable scheduler, with no implicit retry', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': '120' } }));
    await expect(createLogiClient(config, { fetchImpl }).list('event-summaries')).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 120_000 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(logiRetryAfterMs('Fri, 02 Oct 2026 12:02:00 GMT', Date.parse('2026-10-02T12:00:00Z'))).toBe(120_000);
    expect(logiRetryAfterMs('not a date', 0)).toBeNull();
    expect(logiRetryAfterMs('-1', 0)).toBeNull();
  });

  it('rejects oversized streamed bodies even without Content-Length', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(257)); }, cancel() { cancelled = true; } });
    const fetchImpl: LogiFetch = async () => new Response(stream, { headers: { 'content-type': 'application/json' } });
    await expect(createLogiClient({ ...config, maxBodyBytes: 256 }, { fetchImpl }).list('event-summaries')).rejects.toMatchObject({ code: 'invalid_response' });
    expect(cancelled).toBe(true);
  });

  it.each([
    () => new Response('{}', { headers: { 'content-type': 'text/html' } }),
    () => new Response('{invalid', { headers: { 'content-type': 'application/json' } }),
    () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '999999999' } }),
    () => json({ ...listBody, adminSecret: 'never-project' }),
  ])('rejects wrong content type, invalid JSON, oversized length and unknown keys', async (response) => {
    await expect(createLogiClient(config, { fetchImpl: async () => response() }).list('event-summaries')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('bounds a request that never returns headers and a body that stalls', async () => {
    const stalled: LogiFetch = () => new Promise(() => {});
    await expect(createLogiClient({ ...config, timeoutMs: 15 }, { fetchImpl: stalled }).list('event-summaries')).rejects.toMatchObject({ code: 'timeout' });
    const slowBody: LogiFetch = async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } });
    await expect(createLogiClient({ ...config, timeoutMs: 15 }, { fetchImpl: slowBody }).list('event-summaries')).rejects.toMatchObject({ code: 'timeout' });
  });

  it('reads atomic records and tombstones and rejects mismatched envelope or inner IDs', async () => {
    const { client } = setup(syncFixtures.record);
    await expect(client.syncRecord('event-summaries', 'fixture-event-1')).resolves.toEqual(syncFixtures.record.data);
    await expect(setup(syncFixtures.removal).client.syncRecord('event-summaries', 'fixture-event-1')).resolves.toMatchObject({ operation: 'remove', data: null });
    await expect(setup(syncFixtures.record).client.syncRecord('event-summaries', 'other-event')).rejects.toMatchObject({ code: 'scope_mismatch' });
    const bad = { data: { ...syncFixtures.record.data, data: { ...syncFixtures.record.data.data, id: 'other-event' } } };
    await expect(setup(bad).client.syncRecord('event-summaries', 'fixture-event-1')).rejects.toMatchObject({ code: 'scope_mismatch' });
  });

  it('binds change requests to explicit resources and rejects foreign hints', async () => {
    const { client, fetchImpl } = setup(syncFixtures.bootstrap);
    await client.startChanges(['match-summaries', 'event-summaries']);
    const url = new URL(fetchImpl.mock.calls[0]![0]);
    expect(url.searchParams.get('resources')).toBe('event-summaries,match-summaries');
    expect(url.searchParams.get('start')).toBe('now');
    await expect(setup(syncFixtures.changes).client.changes(['match-summaries'], 'cursor')).rejects.toMatchObject({ code: 'scope_mismatch' });
  });
});

describe('exact subject membership', () => {
  const at = Date.parse('2026-09-28T12:00:10Z');
  function membership(body: unknown, now = at) {
    return createLogiClient({ ...config, guildId: '111111111111111111', resources: ['membership-summaries'] }, { fetchImpl: async () => json({ data: body }), now: () => now });
  }
  it('accepts actual present, departed and unknown producer fixtures', async () => {
    for (const fixture of [memberFixtures.present, memberFixtures.departed, memberFixtures.unknown]) {
      expect(await membership(fixture).membership(fixture.discordUserId)).toEqual(fixture);
    }
  });
  it('does not refresh stale observations using a recent receivedAt', async () => {
    const value = { ...memberFixtures.present, receivedAt: '2026-09-28T12:03:00Z' };
    expect(await membership(value, at + 180_000).membership(value.discordUserId)).toMatchObject({ state: 'unknown', roleIds: [], completeness: 'unavailable' });
    expect(await membership({ ...value, observedAt: '2026-09-28T12:01:00Z' }).membership(value.discordUserId)).toMatchObject({ state: 'unknown', roleIds: [] });
  });
  it('rejects subject aliases, wrong guild/game and contradictory role evidence', async () => {
    await expect(membership(memberFixtures.present).membership('222222222222222223')).rejects.toMatchObject({ code: 'scope_mismatch' });
    await expect(membership(memberFixtures.differentGuild).membership(memberFixtures.present.discordUserId)).rejects.toMatchObject({ code: 'scope_mismatch' });
    await expect(membership({ ...memberFixtures.present, gameId: 'hell_let_loose' }).membership(memberFixtures.present.discordUserId)).rejects.toMatchObject({ code: 'scope_mismatch' });
    await expect(membership({ ...memberFixtures.present, state: 'unknown', completeness: 'unavailable' }).membership(memberFixtures.present.discordUserId)).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
