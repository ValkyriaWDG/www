import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createLogiCommandClient, LogiCommandError } from './logi-command-client';
import type { LogiCommandReceipt, LogiEventCommand, LogiEventEditor } from './logi-command-contract';
import { configuredLogiSources } from './logi-config';

const source = configuredLogiSources({ LOGI_EVENT_WRITE_ENABLED: true, LOGI_SOURCES_JSON: JSON.stringify([{ sourceInstanceId: 'synthetic', origin: 'https://logi.example.test', guildId: '100000000000000001', gameId: 'wardogs' }]), LOGI_EVENT_API_KEY_WDG: 'synthetic-command-key-0123456789' }, 'commands')[0]!;
const token = 'synthetic-opaque-actor-token-0123456789';
const event = { kind: 'match' as const, name: 'Synthetic match', registrationEnd: '2026-10-10T18:00:00.000Z', meetingStart: '2026-10-10T18:15:00.000Z', gameStart: '2026-10-10T18:30:00.000Z', gameEnd: '2026-10-10T20:30:00.000Z' };
const command: LogiEventCommand = { operation: 'create', event };
const receipt: LogiCommandReceipt = { eventId: 'event-1', guildId: source.guildId, gameId: source.gameId, revision: '9007199254740993', operation: 'create', receiptId: 'receipt-1', replayed: false };
const editor: LogiEventEditor = { eventId: receipt.eventId, guildId: source.guildId, gameId: source.gameId, revision: receipt.revision, event, canEdit: true, canCancel: true };

describe('Logi command HTTP boundary', () => {
  it('uses only the fixed scoped endpoint and sends separate service/actor credentials with the original request ID', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: receipt }));
    const id = randomUUID();
    await expect(createLogiCommandClient(source, token, fetchImpl).submit(command, id)).resolves.toEqual(receipt);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://logi.example.test/api/v1/clan/event-commands?game=wardogs');
    expect(options).toMatchObject({ method: 'POST', redirect: 'manual', credentials: 'omit', cache: 'no-store', body: JSON.stringify(command) });
    const headers = new Headers(options!.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${source.apiKey}`);
    expect(headers.get('x-logi-actor-token')).toBe(token);
    expect(headers.get('idempotency-key')).toBe(id);
    expect(headers.get('cookie')).toBeNull();
  });

  it('loads only the requested editor identity and never sends a mutation on GET', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: editor }));
    await expect(createLogiCommandClient(source, token, fetchImpl).load('event-1')).resolves.toEqual(editor);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://logi.example.test/api/v1/clan/event-commands/event-1?game=wardogs');
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ method: 'GET' });
    expect(fetchImpl.mock.calls[0]![1]!.body).toBeUndefined();
    expect(new Headers(fetchImpl.mock.calls[0]![1]!.headers).get('idempotency-key')).toBeNull();
  });

  it('rejects private/unknown input fields, path traversal, invalid chronology and header injection before fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createLogiCommandClient(source, token, fetchImpl);
    expect(() => client.submit({ ...command, event: { ...event, serverPassword: 'not-allowed' } } as LogiEventCommand, randomUUID())).toThrow();
    expect(() => client.submit({ ...command, event: { ...event, gameEnd: event.gameStart } }, randomUUID())).toThrow();
    expect(() => client.submit(command, 'request\r\nInjected: true')).toThrow();
    await expect(client.load('../settings')).rejects.toThrow();
    expect(() => createLogiCommandClient(source, `${token}\r\nOther: header`, fetchImpl)).toThrow(LogiCommandError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([{ guildId: '100000000000000099' }, { gameId: 'hell_let_loose' }, { operation: 'cancel' }])('rejects a success receipt outside the requested scope %j', async (patch) => {
    const client = createLogiCommandClient(source, token, async () => Response.json({ data: { ...receipt, ...patch } }));
    await expect(client.submit(command, randomUUID())).rejects.toMatchObject({ code: 'scope_mismatch', uncertain: true });
  });

  it('requires update/cancel receipts and editor responses to name the requested event', async () => {
    const wrong = createLogiCommandClient(source, token, async () => Response.json({ data: { ...receipt, operation: 'cancel', eventId: 'different' } }));
    await expect(wrong.submit({ operation: 'cancel', eventId: 'event-1', expectedRevision: receipt.revision }, randomUUID())).rejects.toMatchObject({ code: 'scope_mismatch', uncertain: true });
    const reader = createLogiCommandClient(source, token, async () => Response.json({ data: { ...editor, eventId: 'different' } }));
    await expect(reader.load('event-1')).rejects.toMatchObject({ code: 'scope_mismatch', uncertain: false });
  });

  it('refuses redirects without forwarding credentials or automatically retrying', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 307, headers: { location: 'https://attacker.example.test' } }));
    await expect(createLogiCommandClient(source, token, fetchImpl).submit(command, randomUUID())).rejects.toMatchObject({ code: 'redirect', uncertain: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([[400, 'invalid_request'], [401, 'unauthorized'], [403, 'policy_denied'], [409, 'revision_conflict'], [409, 'idempotency_conflict']] as const)('distinguishes definitive HTTP %i / %s rejection', async (status, code) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code } }, { status }));
    await expect(createLogiCommandClient(source, token, fetchImpl).submit(command, randomUUID())).rejects.toMatchObject({ code, uncertain: false });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([408, 500, 503])('keeps HTTP %i outcomes uncertain even with a definitive-looking body', async (status) => {
    const client = createLogiCommandClient(source, token, async () => Response.json({ error: { code: 'policy_denied' } }, { status }));
    await expect(client.submit(command, randomUUID())).rejects.toMatchObject({ uncertain: true });
  });

  it('retains bounded 429 Retry-After timing without implicit POST retry', async () => {
    for (const [value, expected] of [['120', 120_000], ['999999999', 86_400_000]] as const) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': value } }));
      await expect(createLogiCommandClient(source, token, fetchImpl).submit(command, randomUUID())).rejects.toMatchObject({ code: 'rate_limited', uncertain: true, retryAfterMs: expected });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
    const at = Date.now();
    const date = new Date(at + 120_000).toUTCString();
    const error = await createLogiCommandClient(source, token, async () => new Response(null, { status: 429, headers: { 'retry-after': date } })).submit(command, randomUUID()).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(LogiCommandError);
    expect((error as LogiCommandError & { retryAfterMs?: number }).retryAfterMs).toBeGreaterThan(118_000);
    expect((error as LogiCommandError & { retryAfterMs?: number }).retryAfterMs).toBeLessThanOrEqual(120_000);
  });

  it('rejects oversized, malformed and private success responses without leaking their bodies', async () => {
    const responses = [
      () => new Response('sensitive provider text', { status: 500 }),
      () => new Response('{', { headers: { 'content-type': 'application/json' } }),
      () => Response.json({ data: { ...receipt, token: 'synthetic-private-token' } }),
      () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '32769' } }),
      () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(32769)); controller.close(); } }), { headers: { 'content-type': 'application/json' } }),
    ];
    for (const response of responses) {
      const result = await createLogiCommandClient(source, token, async () => response()).submit(command, randomUUID()).catch((error: unknown) => error);
      expect(result).toBeInstanceOf(LogiCommandError);
      expect(result).toMatchObject({ uncertain: true });
      expect(String(result)).not.toMatch(/sensitive|synthetic-private-token/);
    }
  });

  it('bounds a fetch that never resolves even if its adapter ignores AbortSignal', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    await expect(createLogiCommandClient(source, token, fetchImpl).submit(command, randomUUID())).rejects.toMatchObject({ uncertain: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  }, 12_000);

  it('bounds a stalled response stream and cancels it', async () => {
    let cancelled = false;
    const fetchImpl: typeof fetch = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } });
    await expect(createLogiCommandClient(source, token, fetchImpl).submit(command, randomUUID())).rejects.toMatchObject({ uncertain: true });
    expect(cancelled).toBe(true);
  }, 12_000);
});
