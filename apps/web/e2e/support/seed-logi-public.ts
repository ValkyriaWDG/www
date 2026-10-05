import pg from 'pg';
import { FIXTURE_SLUGS } from '../../src/fixtures/data';
import { configuredLogiSources, type LogiIntegrationEnv } from '../../src/modules/integrations/logi-config';
import { logiResourceSchemas, type LogiCollectionResource } from '../../src/modules/integrations/logi/contracts';

/** Called only by the opt-in standalone-browser harness after its ordinary fixtures. */
const target = new URL(process.env.DATABASE_URL ?? '');
if (process.env.E2E_LOGI_PUBLIC_FIXTURES !== '1' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || !/^[A-Za-z0-9_]+_logi_e2e$/.test(target.pathname.slice(1))) {
  throw new Error('Logi browser fixtures require an explicitly selected loopback _logi_e2e database.');
}
const client = new pg.Client({ connectionString: target.toString() });
await client.connect();
try {
  const archive = await client.query<{ id: string }>('select id from "match" where slug = $1 and game = $2 and publication = $3 and is_fixture = true', [FIXTURE_SLUGS.matches.hllHistorical, 'hell-let-loose', 'published']);
  if (archive.rows.length !== 1) throw new Error('Expected the one published synthetic HLL archive fixture.');
  const wardogs = await client.query<{ id: string }>('select id from "match" where slug = $1 and game = $2 and publication = $3 and is_fixture = true', [FIXTURE_SLUGS.matches.upcoming, 'wardogs', 'published']);
  if (wardogs.rows.length !== 1) throw new Error('Expected the one published synthetic Wardogs upcoming fixture.');
  const guildId = '910000000000000001';
  const sourceInstanceId = 'synthetic-public-match-source';
  const origin = 'https://logi.example.test';
  const env: LogiIntegrationEnv = {
    LOGI_SOURCES_JSON: JSON.stringify([
      { sourceInstanceId, origin, guildId, gameId: 'hell_let_loose', publishMatches: true, matchLinks: [{ eventId: 'synthetic-history-00', matchId: archive.rows[0]!.id }], matchAliases: [{ canonicalEventId: 'synthetic-history-01', aliasEventIds: ['synthetic-history-alias'] }] },
      { sourceInstanceId, origin, guildId, gameId: 'wardogs', publishMatches: true, matchLinks: [{ eventId: 'synthetic-next-wardogs', matchId: wardogs.rows[0]!.id }] },
    ]),
    LOGI_DATA_API_KEY_HLL: 'synthetic-public-hll-key-not-a-credential',
    LOGI_DATA_API_KEY_WDG: 'synthetic-public-wardogs-key-not-a-credential',
  };
  const now = new Date();
  const iso = (milliseconds: number) => new Date(now.getTime() + milliseconds).toISOString();
  const day = 86_400_000;
  const team = (slot: 'a' | 'b' | 'c', game: 'hell_let_loose' | 'wardogs') => ({
    teamId: `synthetic-${game}-${slot}`, slot, side: game === 'hell_let_loose' ? (slot === 'a' ? 'Axis' : 'Allies') : ({ a: 'Lonestar', b: 'Manticore', c: 'Valkyra' }[slot]),
    name: `[SYNTHETIC] Team ${slot.toUpperCase()}`, shortCode: `SY${slot.toUpperCase()}`, logoUrl: 'https://excluded.invalid/never-render-logo.png', teamRevision: 1, capturedAt: now.toISOString(),
  });
  await client.query('begin');
  // An unassociated website match lies between two connected results. A real mixed page
  // must order it there, rather than append a second collection after the provider rows.
  await client.query(`insert into "match" (id, slug, game, opponent_name, competition_type, starts_at, status, publication, published_at, is_fixture)
    values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now(), true)`, ['synthetic-unified-local', 'hell-let-loose', '[SYNTHETIC] Local Interleaved Opponent', 'friendly', iso(-1.5 * day), 'completed', 'published']);
  for (const source of configuredLogiSources(env, 'data')) {
    const generation = 'synthetic-public-v1';
    await client.query('insert into logi_sync_scope (scope_key, source_instance_id, guild_id, game_id, active_generation, last_success_at, last_attempt_at) values ($1,$2,$3,$4,$5,$6,$6)', [source.scopeKey, source.sourceInstanceId, source.guildId, source.gameId, generation, now]);
    const insert = async (resource: LogiCollectionResource, data: Record<string, unknown>) => {
      const records = data.id === 'synthetic-history-01' ? [data, { ...data, id: 'synthetic-history-alias', ...('eventId' in data ? { eventId: 'synthetic-history-alias' } : {}) }] : [data];
      for (const record of records) {
        const safe = logiResourceSchemas[resource].parse(record);
        await client.query('insert into logi_projection (scope_key, generation, resource, external_id, revision, operation, data, observed_at) values ($1,$2,$3,$4,$5,$6,$7,$8)', [source.scopeKey, generation, resource, record.id, '1', 'upsert', safe, now]);
      }
    };
    if (source.gameId === 'hell_let_loose') {
      for (let index = 0; index < 12; index++) {
        const id = `synthetic-history-${String(index).padStart(2, '0')}`;
        const identity = { id, guildId, gameId: source.gameId, title: `[SYNTHETIC] Match history ${String(index).padStart(2, '0')}`, updatedAt: now.toISOString() };
        await insert('event-summaries', { ...identity, kind: 'match', status: null, startsAt: null, endsAt: iso(-(index + 1) * day), matchTeams: index === 0 ? [team('b', source.gameId), team('a', source.gameId)] : null });
        await insert('match-summaries', { ...identity, eventId: id, resultState: 'provisional', matchTeams: null, result: { mapId: 'synthetic-map', mapName: 'Synthetic Map', sideA: 'Axis', sideB: 'Allies', score: { sideA: index === 0 ? 5 : 0, sideB: index === 0 ? 0 : 5 }, outcome: 'defeat', endedAt: iso(-(index + 1) * day), provenance: { type: 'event_result_import', importedAt: now.toISOString() } } });
        await insert('result-summaries', { ...identity, eventId: id, resultState: index === 0 ? 'confirmed' : 'unknown', result: index === 0 ? {
          version: 2, status: 'confirmed', participants: [{ id: 'axis', label: 'Axis', score: 0 }, { id: 'allies', label: 'Allies', score: 5 }],
          provenance: { origin: 'manual', sources: [] }, reviewedAt: now.toISOString(), supersedesVersion: 1, attribution: { verified: 0, unresolved: 0 },
        } : null });
      }
    }
    const id = `synthetic-next-${source.gameId}`;
    await insert('event-summaries', { id, guildId, gameId: source.gameId, title: `[SYNTHETIC] Next ${source.gameId} match`, updatedAt: now.toISOString(), kind: 'match', status: 'registration', startsAt: iso(60 * 60_000), endsAt: iso(3 * 60 * 60_000), matchTeams: source.gameId === 'wardogs' ? [team('c', source.gameId), team('a', source.gameId), team('b', source.gameId)] : [team('a', source.gameId), team('b', source.gameId)] });
  }
  await client.query('commit');
  // Only invented source settings leave this process, never its database connection string.
  process.stdout.write(JSON.stringify(env));
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  await client.end();
}
