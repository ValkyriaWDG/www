import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CrconRequestError, fetchPublicInfo, fetchScoreboard, parseCrconConfig, parsePublicInfo, type CrconServerConfig } from './crcon';
import { syntheticPublicInfo } from './crcon-fixtures';

describe('CRCON configuration', () => {
  it('accepts HTTPS sources and an explicit loopback mock only', () => {
    const config = JSON.stringify([
      { publicId: 'valkyria-1', name: 'Valkyria #1', baseUrl: 'https://crcon.example.org/', address: 'play.example.org:7777', statsUrl: 'https://stats.example.org/' },
      { publicId: 'mock', baseUrl: 'http://127.0.0.1:4010' },
    ]);
    expect(parseCrconConfig(config)).toEqual({
      servers: [
        { publicId: 'valkyria-1', name: 'Valkyria #1', baseUrl: 'https://crcon.example.org/', address: 'play.example.org:7777', statsUrl: 'https://stats.example.org/', statsApiKey: null },
        { publicId: 'mock', name: null, baseUrl: 'http://127.0.0.1:4010', address: null, statsUrl: null, statsApiKey: null },
      ],
      error: null,
    });
    expect(parseCrconConfig('')).toEqual({ servers: [], error: null });
  });

  it.each([
    ['plain HTTP to a remote host', [{ publicId: 'a', baseUrl: 'http://crcon.example.org' }]],
    ['credentials in the URL', [{ publicId: 'a', baseUrl: 'https://user:secret@crcon.example.org' }]],
    ['a query string', [{ publicId: 'a', baseUrl: 'https://crcon.example.org/?url=https://evil.example' }]],
    ['duplicate public IDs', [{ publicId: 'a', baseUrl: 'https://one.example.org' }, { publicId: 'a', baseUrl: 'https://two.example.org' }]],
    ['an unsafe public ID', [{ publicId: 'A B', baseUrl: 'https://one.example.org' }]],
    ['a join address with a scheme', [{ publicId: 'a', baseUrl: 'https://one.example.org', address: 'steam://connect/1.2.3.4:7777' }]],
  ])('disables the whole set for %s', (_label, value) => {
    expect(parseCrconConfig(JSON.stringify(value))).toEqual({ servers: [], error: 'invalid_config' });
  });

  it('reports malformed JSON without echoing it', () => {
    expect(parseCrconConfig('[{"baseUrl": "https://private.example"')).toEqual({ servers: [], error: 'invalid_json' });
  });
});

describe('CRCON public information projection', () => {
  it('reads the current response shape', () => {
    expect(parsePublicInfo(syntheticPublicInfo())).toEqual({
      name: '[SYNTHETIC] CRCON Test Server',
      map: 'Synthetic Map North',
      mode: 'Warfare',
      nextMap: 'Synthetic Map East',
      players: 64,
      capacity: 100,
      teams: { allied: 33, axis: 31 },
      score: { allied: 3, axis: 2 },
      timeRemainingSeconds: 3252,
    });
  });

  it('reads the older flat response shape', () => {
    const body = {
      failed: false,
      result: {
        name: '[SYNTHETIC] Older CRCON',
        current_map: { just_name: 'synthetic', human_name: 'Synthetic Map South', name: 'synthetic_offensive_ger', start: 1 },
        next_map: { human_name: 'Synthetic Map West', name: 'synthetic_west_warfare' },
        player_count: 12,
        max_player_count: 100,
        players: { allied: 7, axis: 5 },
        score: { allied: 1, axis: 4 },
        raw_time_remaining: '0:12:05',
      },
    };
    expect(parsePublicInfo(body)).toEqual({
      name: '[SYNTHETIC] Older CRCON',
      map: 'Synthetic Map South',
      mode: 'Offensive',
      nextMap: 'Synthetic Map West',
      players: 12,
      capacity: 100,
      teams: { allied: 7, axis: 5 },
      score: { allied: 1, axis: 4 },
      timeRemainingSeconds: 725,
    });
  });

  it('keeps unknown or implausible values null instead of inventing them', () => {
    const info = parsePublicInfo(
      syntheticPublicInfo({
        player_count: 140,
        max_player_count: 100,
        player_count_by_team: { allied: -1, axis: 3 },
        score: { allied: 9, axis: 1 },
        time_remaining: Number.NaN,
        current_map: null,
        name: { name: 'Line\nbreak\u202eand controls' },
      }),
    );
    expect(info).toMatchObject({ players: null, capacity: 100, teams: null, score: null, timeRemainingSeconds: null, map: null, mode: null, name: 'Line break and controls' });
  });

  it('rejects failed or malformed envelopes', () => {
    expect(parsePublicInfo({ failed: true, result: null, error: 'x' })).toBeNull();
    expect(parsePublicInfo({ result: [] })).toBeNull();
    expect(parsePublicInfo('nope')).toBeNull();
  });
});

describe('CRCON request', () => {
  let server: Server;
  let base: string;
  const routes = new Map<string, (res: ServerResponse) => void>();

  beforeAll(async () => {
    server = createServer((req, res) => {
      const route = routes.get(req.url ?? '');
      if (route) route(res);
      else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const config = (path: string): CrconServerConfig => ({ publicId: 'mock', name: null, baseUrl: `${base}${path}`, address: null, statsUrl: null });
  const signal = () => AbortSignal.timeout(2000);

  it('requests <base>/api/get_public_info over real HTTP and projects the result', async () => {
    routes.set('/crcon/api/get_public_info', (res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(syntheticPublicInfo()));
    });
    await expect(fetchPublicInfo(config('/crcon'), signal())).resolves.toMatchObject({ map: 'Synthetic Map North', players: 64 });
  });

  it('does not follow redirects, rejects errors, oversized and invalid bodies', async () => {
    routes.set('/redirect/api/get_public_info', (res) => {
      res.statusCode = 302;
      res.setHeader('location', '/crcon/api/get_public_info');
      res.end();
    });
    routes.set('/error/api/get_public_info', (res) => {
      res.statusCode = 502;
      res.end('bad gateway');
    });
    routes.set('/large/api/get_public_info', (res) => res.end(`{"result":"${'x'.repeat(600 * 1024)}"}`));
    routes.set('/html/api/get_public_info', (res) => res.end('<html>login</html>'));
    for (const [path, category] of [
      ['/redirect', 'upstream'],
      ['/error', 'upstream'],
      ['/large', 'invalid'],
      ['/html', 'invalid'],
    ] as const) {
      await expect(fetchPublicInfo(config(path), signal())).rejects.toMatchObject({ name: 'CrconRequestError', category });
    }
  });

  it('reports a slow source as a timeout', async () => {
    routes.set('/slow/api/get_public_info', () => undefined);
    const error = await fetchPublicInfo(config('/slow'), AbortSignal.timeout(100)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CrconRequestError);
    expect(error).toMatchObject({ category: 'timeout' });
  });

  it('requests a scoreboard by numeric game ID and sends the statistics key only when configured', async () => {
    const seen: { url: string; auth: string | undefined }[] = [];
    routes.set('/stats/api/get_map_scoreboard?map_id=4242', (res) => {
      res.setHeader('content-type', 'application/json');
      res.end('{"result":{"player_stats":[]},"failed":false}');
    });
    const wrapped = async (url: URL, init: RequestInit) => {
      seen.push({ url: url.toString(), auth: (init.headers as Record<string, string>).authorization });
      return fetch(url, init);
    };
    await expect(fetchScoreboard(config('/stats'), 4242, signal(), wrapped)).resolves.toEqual({ result: { player_stats: [] }, failed: false });
    await fetchScoreboard({ ...config('/stats'), statsApiKey: 'synthetic-key-0123456789' }, 4242, signal(), wrapped);
    expect(seen).toEqual([
      { url: `${base}/stats/api/get_map_scoreboard?map_id=4242`, auth: undefined },
      { url: `${base}/stats/api/get_map_scoreboard?map_id=4242`, auth: 'Bearer synthetic-key-0123456789' },
    ]);
    await expect(fetchScoreboard(config('/stats'), 0, signal(), wrapped)).rejects.toMatchObject({ category: 'invalid' });
  });
});
