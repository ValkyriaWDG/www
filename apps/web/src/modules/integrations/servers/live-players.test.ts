import { describe, expect, it } from 'vitest';
import { fetchLivePlayers, LIVE_PLAYERS_LIMIT_BYTES, parseLivePlayers } from './live-players';

const server = { publicId: 'alpha', name: 'Alpha', baseUrl: 'https://crcon.example.org/alpha', address: null, statsUrl: null, statsApiKey: 'synthetic-api-key-for-test' };
const snapshot = (stats: unknown[] = []) => ({ failed: false, result: { snapshot_timestamp: 1790683200.125, refresh_interval_sec: 15, stats } });

describe('live CRCON player projection', () => {
  it('allowlists names, sides and nullable counters, keeping zero distinct from unknown', () => {
    const body = snapshot([{ player: '\u0000[SYN] One\u202e', team: { side: 'Allied' }, kills: 0, deaths: -1, combat: '500', support: 12, player_id: 'private-identifier', ip: 'private-address', steaminfo: { private: true }, encounters: [{ private: true }], status: 'online' }]);
    const parsed = parseLivePlayers(body)!;
    expect(parsed).toEqual({ observedAt: new Date(1790683200.125 * 1000).toISOString(), refreshAfterSeconds: 30, players: [{ name: '[SYN] One', side: 'allies', kills: 0, deaths: null, combat: null, offense: null, defense: null, support: 12 }] });
    expect(JSON.stringify(parsed)).not.toMatch(/player_id|private|steaminfo|encounters|status/);
  });

  it('accepts a genuinely empty snapshot and does not invent a side when the source reports null', () => {
    expect(parseLivePlayers(snapshot())?.players).toEqual([]);
    expect(parseLivePlayers(snapshot([{ player: '[SYN] Unknown', team: null }]))?.players[0]?.side).toBe('unknown');
  });

  it.each([null, {}, { failed: true, result: snapshot().result }, { result: { stats: [] } }, { result: { ...snapshot().result, stats: 'invalid' } }, { result: { ...snapshot().result, snapshot_timestamp: Infinity } }, snapshot([{ player_id: 'no-name' }]), snapshot(Array.from({ length: 201 }, () => ({ player: '[SYN]' })))])('rejects malformed or unbounded source data %#', (body) => {
    expect(parseLivePlayers(body)).toBeNull();
  });

  it('bounds upstream refresh suggestions', () => {
    expect(parseLivePlayers({ result: { ...snapshot().result, refresh_interval_sec: 99999 } })?.refreshAfterSeconds).toBe(300);
    expect(parseLivePlayers({ result: { ...snapshot().result, refresh_interval_sec: 0 } })?.refreshAfterSeconds).toBe(30);
  });

  it('fetches only the configured API path, with bounded/no-redirect transport and server-only credentials', async () => {
    const signal = AbortSignal.timeout(1000);
    const result = await fetchLivePlayers(server, signal, async (url, init) => {
      expect(url.href).toBe('https://crcon.example.org/alpha/api/get_live_game_stats');
      expect(init).toMatchObject({ signal, redirect: 'error', cache: 'no-store', headers: { authorization: 'Bearer synthetic-api-key-for-test' } });
      return Response.json(snapshot());
    });
    expect(JSON.stringify(result)).not.toContain('api-key');
  });

  it('rejects failed requests, malformed JSON and declared oversized bodies', async () => {
    for (const response of [new Response('', { status: 401 }), new Response('not-json'), new Response('{}', { headers: { 'content-length': String(LIVE_PLAYERS_LIMIT_BYTES + 1) } })]) {
      await expect(fetchLivePlayers(server, AbortSignal.timeout(1000), async () => response)).rejects.toThrow('CRCON request failed');
    }
  });

  it('caps streamed data even without a content-length header', async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(LIVE_PLAYERS_LIMIT_BYTES + 1)); controller.close(); } }));
    await expect(fetchLivePlayers(server, AbortSignal.timeout(1000), async () => response)).rejects.toMatchObject({ category: 'invalid' });
  });
});
