import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditEvent, legacyImport, match, matchResult, matchStatistics, proseTranslation } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importLegacyBundle } from '@/modules/legacy/import-bundle';
import { sourceHash } from '@/modules/legacy/import-contract';
import { IMPORT_ACTOR } from '@/modules/legacy/import-shared';
import { normalizeLegacyMatchDetails } from '@/modules/legacy/match-details';
import { saveProseDraft } from '@/modules/prose/service';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let root: string;
let sequence = 9300;
const fixture = {
  date: '27/09/2020 19:30', time: '20:30', completed: true,
  teams: { home: { name: 'VLK + Synthetic', score: 3, side: 'allies', country: 'CZ' }, away: { name: 'Synthetic', score: 2, side: 'axis', country: 'EU' } },
  league: { name: 'Friendly' }, format: 'best of 1', capPoint: 'Central', point: 'Old alias', points: ['First', 'Second'], length: '90:30',
  first_capture: 'allies', first_captured: 'axis',
  links: [{ url: 'https://example.org/video', title: 'Synthetic recording', description: 'Synthetic description', author: 'Synthetic author', date: '27/09/2020', type: 'youtube' }],
};
const base = { schemaVersion: 1, sourceOrigin: 'https://valkyriahll.cz', observedAt: '2026-09-29T10:00:00Z', sourceRevision: 'synthetic-parity', documents: [], media: [], scoreboardSources: [], warnings: [] };

beforeAll(async () => { t = await createTestDatabase(); root = await mkdtemp(path.join(os.tmpdir(), 'vlk-parity-')); });
afterAll(async () => { await t.drop(); await rm(root, { recursive: true, force: true }); });

/** Capture every public relation, including privacy/auth/audit state, using synthetic data only. */
async function fingerprint(exclude: string[] = []) {
  const client = new pg.Client({ connectionString: t.url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname='public' order by tablename");
    const result: Record<string, string> = {};
    for (const { tablename } of rows) {
      if (exclude.includes(tablename)) continue;
      const table = `public."${tablename.replaceAll('"', '""')}"`;
      const records = await client.query<{ row: string }>(`select row_to_json(t)::text as row from ${table} t order by row_to_json(t)::text`);
      result[tablename] = sourceHash(records.rows);
    }
    return result;
  } finally { await client.end(); }
}

async function importFixture({ old = true, scores = false } = {}) {
  const input = { ...base, matches: [{ ...structuredClone(fixture), id: ++sequence }], scoreboardSources: [] as Array<{ legacyMatchId: number; ordinal: number; providerGameId: number; valkyriaSide: null; relativeFile: string; sha256: string; bytes: number }> };
  if (scores) for (const ordinal of [1, 2]) {
    const bytes = Buffer.from(JSON.stringify({ result: { id: 700 + ordinal, player_stats: [{ player: 'Synthetic Player', steam_id: 'PRIVATE-MARKER', team: { side: 'allies' }, kills: 10, deaths: 2 }], start: '2020-09-27T18:30:00Z', end: '2020-09-27T20:00:00Z', result: { allied: 2, axis: 3 } } }));
    const relativeFile = `round-${sequence}-${ordinal}.json`;
    await writeFile(path.join(root, relativeFile), bytes);
    input.scoreboardSources.push({ legacyMatchId: sequence, ordinal, providerGameId: 700 + ordinal, valkyriaSide: null, relativeFile, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  }
  const report = await importLegacyBundle(t.db, input, root, { apply: true, publish: true });
  expect(report.items).toMatchObject([{ action: 'create' }]);
  const id = report.items[0]!.targetId!;
  const [entry] = await t.db.select().from(legacyImport).where(eq(legacyImport.matchId, id));
  if (old) {
    const oldMetadata = Object.fromEntries(Object.entries(entry!.sourceMetadata).filter(([key]) => !['matchDetails', 'matchDetailsSha256'].includes(key)));
    await t.db.update(legacyImport).set({ sourceMetadata: oldMetadata }).where(eq(legacyImport.id, entry!.id));
  }
  const [original] = await t.db.select().from(legacyImport).where(eq(legacyImport.id, entry!.id));
  return { input, id, original: original! };
}

describe('additive match metadata repair', () => {
  it('dry-runs without writes, repairs only the provenance plus audit, and replays as a complete no-op after editorial edits', async () => {
    const { input, id, original } = await importFixture({ scores: true });
    const [target] = await t.db.select().from(match).where(eq(match.id, id));
    await t.db.update(match).set({ opponentName: 'Edited opponent', startsAt: new Date('2030-01-01T12:00:00Z'), publication: 'draft', internalNotes: 'Private editorial notes', version: target!.version + 1 }).where(eq(match.id, id));
    await t.db.update(matchResult).set({ scoreValkyria: 5, scoreOpponent: 0 }).where(eq(matchResult.matchId, id));
    await t.db.update(matchStatistics).set({ publishPlayers: false, valkyriaSide: null }).where(eq(matchStatistics.matchId, id));
    const [translation] = await t.db.select().from(proseTranslation).where(eq(proseTranslation.matchId, id));
    await saveProseDraft(t.db, IMPORT_ACTOR, { owner: { kind: 'match', id }, locale: 'cs', expectedVersion: translation!.version, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edited private prose' }] }] } });

    const before = await fingerprint();
    expect((await importLegacyBundle(t.db, input, root, { repairMatchMetadata: true })).items).toMatchObject([{ action: 'repair', targetId: id }]);
    expect(await fingerprint()).toEqual(before);
    expect((await importLegacyBundle(t.db, input, root, { apply: true, repairMatchMetadata: true })).items).toMatchObject([{ action: 'repair', targetId: id }]);
    expect(await fingerprint(['legacy_import', 'audit_event'])).toEqual(Object.fromEntries(Object.entries(before).filter(([key]) => !['legacy_import', 'audit_event'].includes(key))));
    const [repaired] = await t.db.select().from(legacyImport).where(eq(legacyImport.id, original.id));
    const details = normalizeLegacyMatchDetails(input.matches[0]);
    expect(repaired).toEqual({ ...original, sourceMetadata: { ...original.sourceMetadata, matchDetails: details, matchDetailsSha256: sourceHash(details) } });
    expect(JSON.stringify(repaired!.sourceMetadata)).not.toContain('PRIVATE-MARKER');
    const audit = await t.db.select().from(auditEvent).where(eq(auditEvent.action, 'legacy.match.metadata_repair'));
    expect(audit.filter((item) => item.entityId === original.id)).toHaveLength(1);
    const after = await fingerprint();
    expect((await importLegacyBundle(t.db, input, root, { apply: true, repairMatchMetadata: true })).items).toMatchObject([{ action: 'unchanged', targetId: id }]);
    expect(await fingerprint()).toEqual(after);
  });

  it('creates the same projection on fresh imports and detects changes to fields absent from the old hash', async () => {
    const { input } = await importFixture({ old: false });
    expect((await importLegacyBundle(t.db, input, root, { apply: true, repairMatchMetadata: true })).items[0]?.action).toBe('unchanged');
    const changed = { ...input, matches: [{ ...input.matches[0]!, time: '21:30' }] };
    const before = await fingerprint();
    for (const options of [{ apply: true, repairMatchMetadata: true }, { apply: true }]) {
      expect((await importLegacyBundle(t.db, changed, root, options)).items[0]).toMatchObject({ action: 'conflict', reason: 'match_metadata_changed_since_import' });
    }
    expect(await fingerprint()).toEqual(before);
  });

  it('fails closed for changed original facts, clocks, source URLs, or missing imports', async () => {
    const { input, original } = await importFixture();
    const before = await fingerprint();
    const changed = { ...input, matches: [{ ...input.matches[0]!, date: '28/09/2020 19:30' }] };
    expect((await importLegacyBundle(t.db, changed, root, { apply: true, repairMatchMetadata: true })).items[0]).toMatchObject({ action: 'conflict', reason: 'source_changed_since_import' });
    expect((await importLegacyBundle(t.db, input, root, { apply: true, repairMatchMetadata: true, matchClock: 'europe-prague' })).items[0]?.action).toBe('conflict');
    expect((await importLegacyBundle(t.db, { ...input, matches: [{ ...input.matches[0]!, id: ++sequence }] }, root, { apply: true, repairMatchMetadata: true })).items[0]).toMatchObject({ action: 'conflict', reason: 'metadata_repair_requires_existing_import' });
    expect(await fingerprint()).toEqual(before);
    await t.db.update(legacyImport).set({ sourceUrl: 'https://valkyriahll.cz/matches/999999' }).where(eq(legacyImport.id, original.id));
    const altered = await fingerprint();
    expect((await importLegacyBundle(t.db, input, root, { apply: true, repairMatchMetadata: true })).items[0]?.action).toBe('conflict');
    expect(await fingerprint()).toEqual(altered);
  });

  it.each(['only-data', 'only-hash', 'corrupt-data', 'corrupt-hash'])('preserves conflicting metadata instead of overwriting it: %s', async (variant) => {
    const { input, original } = await importFixture({ old: false });
    const metadata = { ...original.sourceMetadata };
    if (variant === 'only-data') delete metadata.matchDetailsSha256;
    if (variant === 'only-hash') delete metadata.matchDetails;
    if (variant === 'corrupt-data') metadata.matchDetails = { privatePayload: 'PRIVATE-MARKER' };
    if (variant === 'corrupt-hash') metadata.matchDetailsSha256 = '0'.repeat(64);
    await t.db.update(legacyImport).set({ sourceMetadata: metadata }).where(eq(legacyImport.id, original.id));
    const before = await fingerprint();
    expect((await importLegacyBundle(t.db, input, root, { apply: true, repairMatchMetadata: true })).items[0]).toMatchObject({ action: 'conflict', reason: 'match_metadata_changed_since_import' });
    expect(await fingerprint()).toEqual(before);
  });

  it('serializes concurrent repairs and adds one audit record', async () => {
    const { input, original } = await importFixture();
    const reports = await Promise.all([1, 2].map(() => importLegacyBundle(t.db, input, root, { apply: true, repairMatchMetadata: true })));
    expect(reports.map((report) => report.items[0]!.action).sort()).toEqual(['repair', 'unchanged']);
    expect((await t.db.select().from(auditEvent).where(eq(auditEvent.entityId, original.id))).filter((entry) => entry.action === 'legacy.match.metadata_repair')).toHaveLength(1);
  });

  it('does not import unrelated media/documents in repair mode or allow publication flags', async () => {
    const { input } = await importFixture();
    const unrelatedDocument = { kind: 'news', legacyId: 'not-an-import-target', slug: 'not-an-import-target', game: 'hell-let-loose', locale: 'cs', sourceLanguage: 'cs', sourceUrl: 'https://valkyriahll.cz/clanky/not-an-import-target', sourcePublishedOn: null, sourceModifiedOn: null, title: 'Unrelated source article', excerpt: '', authorLabel: '', credits: '', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Do not import this during match repair.' }] }] }, coverAssetId: null, tags: [], metadata: {}, warnings: [] };
    const withUnrelated = { ...input, documents: [unrelatedDocument], media: [{ id: 'f2171d09-18b6-4532-a4a7-c01209858e80', role: 'body', sourceUrl: 'https://valkyriahll.cz/never-opened.png', relativeFile: 'never-opened.png', bytes: 1, sha256: '0'.repeat(64), alt: '', rightsStatus: 'legacy-published-owner-migration' }] };
    expect((await importLegacyBundle(t.db, withUnrelated, root, { repairMatchMetadata: true })).items).toMatchObject([{ kind: 'match', action: 'repair' }]);
    const before = await fingerprint();
    for (const flags of [{ publish: true }, { adoptSeed: true }]) await expect(importLegacyBundle(t.db, input, root, { apply: true, repairMatchMetadata: true, ...flags })).rejects.toThrow('Metadata repair');
    expect(await fingerprint()).toEqual(before);
  });
});
