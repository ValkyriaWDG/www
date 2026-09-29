import 'server-only';
import { legacyImport, legacyMatchScoreboard, match, matchStatistics, proseRevision, proseTranslation, tournament, type CoverSnapshot, type Executor, type LegacyScoreboardSnapshot } from '@valkyria/db';
import { and, eq, inArray } from 'drizzle-orm';
import { parseRichTextDocument } from '@/modules/content/rich-text/schema';
import { createMatch, publishMatch, recordResult, updateMatch } from '@/modules/matches/service';
import { parseCrconScoreboard, summarizeTeams } from '@/modules/matches/statistics';
import { publishProse, saveProseDraft } from '@/modules/prose/service';
import { coverSnapshotSchema } from '@/modules/prose/schemas';
import { createTournament, publishTournament } from '@/modules/tournaments/service';
import { importCover, remapBodyAssets } from './import-content';
import { readBundleFile, sourceHash, type ImportDocument } from './import-contract';
import { normalizeLegacyMatch } from './import-match';
import { findIdentity, IMPORT_ACTOR, recordIdentity, type ImportContext, type ImportReportItem } from './import-shared';

function importedProse(body: unknown, cover: CoverSnapshot | null = null) {
  // Match the domain service's persisted normalization before comparing snapshots.
  const parsed = parseRichTextDocument(body);
  if (!parsed.ok) throw new Error('Invalid imported prose');
  return { body: parsed.doc, cover: cover ? coverSnapshotSchema.parse(cover) : null };
}

/** Caller holds the owner lock; keep the domain's owner -> translation lock order. */
async function lockUnchangedProse(tx: Executor, kind: 'match' | 'tournament', id: string, expected: ReturnType<typeof importedProse>) {
  const [prose] = await tx.select().from(proseTranslation).where(and(
    kind === 'match' ? eq(proseTranslation.matchId, id) : eq(proseTranslation.tournamentId, id),
    eq(proseTranslation.locale, 'cs'),
  )).for('update');
  if (!prose?.draftRevisionId) return undefined;
  // Publishing the owner also exposes any already-published prose behind its gate.
  const revisionIds = [...new Set([prose.draftRevisionId, ...(prose.publishedRevisionId ? [prose.publishedRevisionId] : [])])];
  const revisions = await tx.select().from(proseRevision).where(and(
    eq(proseRevision.proseTranslationId, prose.id), eq(proseRevision.locale, 'cs'), inArray(proseRevision.id, revisionIds),
  ));
  const expectedHash = sourceHash(expected);
  if (revisions.length !== revisionIds.length || revisions.some((revision) => sourceHash({ body: revision.body, cover: revision.cover }) !== expectedHash)) return undefined;
  return prose;
}

function importedMatchProse(normalized: ReturnType<typeof normalizeLegacyMatch>) {
  const { row } = normalized;
  const paragraphs = [
    `Původní tým: ${row.teams.home.name}`, row.map ? `Mapa: ${row.map}` : null,
    row.capPoint ? `Středový bod: ${row.capPoint}` : null,
    row.points?.length ? `Body: ${row.points.join(' / ')}` : null,
    row.length ? `Délka: ${row.length} min` : null,
  ].filter((value): value is string => Boolean(value));
  return importedProse({ type: 'doc', content: [
    ...paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
    ...(row.links ?? []).map((link) => ({ type: 'paragraph', content: [{ type: 'text', text: link.title || link.author || 'Záznam zápasu', marks: [{ type: 'link', attrs: { href: link.url } }] }] })),
    { type: 'paragraph', content: [{ type: 'text', text: 'Původní záznam zápasu', marks: [{ type: 'link', attrs: { href: normalized.sourceUrl } }] }] },
  ] });
}

export async function importTournamentRecord(db: Executor, context: ImportContext, document: ImportDocument): Promise<ImportReportItem> {
  const identity = { kind: 'tournament' as const, key: document.legacyId, hash: sourceHash(document), sourceUrl: document.sourceUrl, sourcePublishedOn: document.sourcePublishedOn, sourceLanguage: document.sourceLanguage, credits: document.credits, sourceMetadata: { sourceModifiedOn: document.sourceModifiedOn, metadata: document.metadata, warnings: document.warnings } };
  const base = { kind: identity.kind, key: identity.key };
  return db.transaction(async (tx) => {
    const imported = await findIdentity(tx, context, identity);
    if (imported) {
      if (imported.sourceSha256 !== identity.hash) return { ...base, action: 'conflict', reason: 'source_changed_since_import' };
      const [row] = await tx.select().from(tournament).where(eq(tournament.id, imported.tournamentId!)).for('update');
      if (!row) return { ...base, action: 'conflict', reason: 'imported_target_missing' };
      if (context.options.publish && row.publication === 'draft') {
        if (row.version !== imported.importedVersion) return { ...base, action: 'conflict', reason: 'edited_draft_not_published_by_migration' };
        const expected = importedProse(remapBodyAssets(document.body, context.media), importCover(document, context));
        const prose = await lockUnchangedProse(tx, 'tournament', row.id, expected);
        if (!prose) return { ...base, action: 'conflict', reason: 'edited_draft_not_published_by_migration' };
        if (context.options.apply) {
          if (!prose.publishedRevisionId) await publishProse(tx, IMPORT_ACTOR, { owner: { kind: 'tournament', id: row.id }, locale: 'cs', expectedVersion: prose.version });
          const result = await publishTournament(tx, IMPORT_ACTOR, { id: row.id, expectedVersion: row.version });
          await tx.update(legacyImport).set({ importedVersion: result.version }).where(eq(legacyImport.id, imported.id));
        }
        return { ...base, action: 'publish', targetId: row.id };
      }
      return { ...base, action: 'unchanged', targetId: row.id };
    }
    const [collision] = await tx.select({ id: tournament.id }).from(tournament).where(eq(tournament.slug, document.slug));
    if (collision) return { ...base, action: 'conflict', reason: 'existing_tournament_slug' };
    const { body, cover } = importedProse(remapBodyAssets(document.body, context.media), importCover(document, context));
    if (!context.options.apply) return { ...base, action: 'create' };
    if (!document.game) throw new Error('Tournament game missing');
    const created = await createTournament(tx, IMPORT_ACTOR, {
      slug: document.slug, game: document.game, name: document.metadata.name || document.title,
      season: document.metadata.season, startsOn: document.metadata.startsOn, endsOn: document.metadata.endsOn,
      links: document.metadata.links ?? [{ url: document.sourceUrl, label: 'Legacy source' }],
      internalNotes: [document.sourceUrl, ...(document.metadata.sourceNotes ?? []), ...document.warnings].join('\n').slice(0, 5000),
    });
    const prose = await saveProseDraft(tx, IMPORT_ACTOR, { owner: { kind: 'tournament', id: created.id }, locale: 'cs', expectedVersion: 0, body, cover });
    let version = created.version;
    if (context.options.publish) {
      await publishProse(tx, IMPORT_ACTOR, { owner: { kind: 'tournament', id: created.id }, locale: 'cs', expectedVersion: prose.version });
      version = (await publishTournament(tx, IMPORT_ACTOR, { id: created.id, expectedVersion: version })).version;
    }
    await recordIdentity(tx, context, identity, { tournamentId: created.id, importedVersion: version });
    return { ...base, action: 'create', targetId: created.id };
  });
}

/** Parse private local exports once; only the public statistical allowlist reaches persistence. */
async function readMatchScoreboards(context: ImportContext, legacyId: number): Promise<LegacyScoreboardSnapshot[]> {
  const sources = context.bundle.scoreboardSources.filter((item) => item.legacyMatchId === legacyId).sort((a, b) => a.ordinal - b.ordinal);
  const snapshots: LegacyScoreboardSnapshot[] = [];
  for (const source of sources) {
    const parsed = parseCrconScoreboard(JSON.parse((await readBundleFile(context.root, source, 16 * 1024 * 1024)).toString('utf8')));
    if (!parsed || !parsed.players.length || (source.providerGameId !== null && parsed.externalGameId !== String(source.providerGameId))) throw new Error('Invalid legacy scoreboard identity');
    if (source.sourceGameUrl && source.sourceGameUrl.split('/').at(-1) !== parsed.externalGameId) throw new Error('Verified source URL does not identify the snapshot');
    snapshots.push({
      externalGameId: parsed.externalGameId,
      sourceGameUrl: source.sourceGameUrl ?? null,
      mapName: parsed.mapName, mode: parsed.mode, gameStartedAt: parsed.startedAt?.toISOString() ?? null,
      gameEndedAt: parsed.endedAt?.toISOString() ?? null, result: parsed.result,
      valkyriaSide: source.valkyriaSide ?? null,
      teams: summarizeTeams(parsed), players: parsed.players, observedAt: context.bundle.observedAt,
    });
  }
  return snapshots;
}

export async function importMatchRecord(db: Executor, context: ImportContext, input: unknown): Promise<ImportReportItem> {
  const normalized = normalizeLegacyMatch(input, context.options.matchClock);
  const { row, facts } = normalized;
  const sources = context.bundle.scoreboardSources.filter((item) => item.legacyMatchId === row.id);
  const media = context.bundle.matchMedia?.find((item) => item.legacyMatchId === row.id);
  const identity = { kind: 'match' as const, key: String(row.id), sourceUrl: normalized.sourceUrl, hash: sourceHash({ row, clock: context.options.matchClock ?? 'legacy-fixed-offset', sources, media }), sourceMetadata: { identityRepair: row._legacyIdentity ?? null, sourceDate: row.date, clock: context.options.matchClock ?? 'legacy-fixed-offset', scoreboardSources: sources.map(({ ordinal, providerGameId, sha256, sourceGameUrl, notes }) => ({ ordinal, providerGameId, sha256, sourceGameUrl: sourceGameUrl ?? null, notes: notes ?? [] })), warnings: context.bundle.warnings.filter((note) => new RegExp(`\\b${row.id}\\b`).test(note)) } };
  const base = { kind: identity.kind, key: identity.key };
  // Validate every file even in a dry run; a corrupt later round cannot partially import a match.
  const snapshots = await readMatchScoreboards(context, row.id);
  return db.transaction(async (tx) => {
    const imported = await findIdentity(tx, context, identity);
    if (imported) {
      if (imported.sourceSha256 !== identity.hash) return { ...base, action: 'conflict', reason: 'source_changed_since_import' };
      const [target] = await tx.select().from(match).where(eq(match.id, imported.matchId!)).for('update');
      if (!target) return { ...base, action: 'conflict', reason: 'imported_target_missing' };
      if (context.options.publish && target.publication === 'draft') {
        if (target.version !== imported.importedVersion) return { ...base, action: 'conflict', reason: 'edited_draft_not_published_by_migration' };
        const prose = await lockUnchangedProse(tx, 'match', target.id, importedMatchProse(normalized));
        if (!prose) return { ...base, action: 'conflict', reason: 'edited_draft_not_published_by_migration' };
        if (context.options.apply) {
          if (!prose.publishedRevisionId) await publishProse(tx, IMPORT_ACTOR, { owner: { kind: 'match', id: target.id }, locale: 'cs', expectedVersion: prose.version });
          const result = await publishMatch(tx, IMPORT_ACTOR, { id: target.id, expectedVersion: target.version });
          await tx.update(legacyImport).set({ importedVersion: result.version }).where(eq(legacyImport.id, imported.id));
        }
        return { ...base, action: 'publish', targetId: target.id };
      }
      return { ...base, action: 'unchanged', targetId: target.id };
    }
    const [collision] = await tx.select({ id: match.id }).from(match).where(eq(match.slug, String(row.id)));
    if (collision) return { ...base, action: 'conflict', reason: 'existing_match_slug' };
    const [competition] = normalized.tournamentSlug ? await tx.select().from(tournament).where(eq(tournament.slug, normalized.tournamentSlug)) : [];
    if (normalized.tournamentSlug && !competition && context.options.apply) return { ...base, action: 'conflict', reason: 'import_tournament_first' };
    if (!context.options.apply) return { ...base, action: 'create' };
    const mapped = (id: string | null | undefined) => {
      if (!id) return null;
      const found = context.media.get(id);
      if (!found) throw new Error('Unresolved match media');
      return found;
    };
    const created = await createMatch(tx, IMPORT_ACTOR, { ...facts, tournamentId: competition?.id, opponentLogoAssetId: mapped(media?.awayLogoAssetId), coverAssetId: mapped(media?.mapAssetId) });
    let version = created.version;
    const round = { ordinal: 1, mapName: row.map ?? null, side: normalized.valkyriaSide, mode: null, scoreValkyria: null, scoreOpponent: null };
    if (row.completed) {
      version = (await recordResult(tx, IMPORT_ACTOR, { id: created.id, expectedVersion: version, scoreValkyria: row.teams.home.score, scoreOpponent: row.teams.away.score, verification: 'provisional', source: normalized.sourceUrl, rounds: [round] })).version;
    } else version = (await updateMatch(tx, IMPORT_ACTOR, { id: created.id, expectedVersion: version, rounds: [round] })).version;

    const { body } = importedMatchProse(normalized);
    const prose = await saveProseDraft(tx, IMPORT_ACTOR, { owner: { kind: 'match', id: created.id }, locale: 'cs', expectedVersion: 0, body });
    if (snapshots.length) {
      const primary = snapshots[0]!;
      await tx.insert(matchStatistics).values({
        matchId: created.id, source: 'upload', sourceLabel: 'Legacy CRCON export', externalGameId: primary.externalGameId,
        sourceServerPublicId: null, sourceGameUrl: primary.sourceGameUrl, mapName: primary.mapName, mode: primary.mode,
        gameStartedAt: primary.gameStartedAt ? new Date(primary.gameStartedAt) : null,
        gameEndedAt: primary.gameEndedAt ? new Date(primary.gameEndedAt) : null,
        resultAllied: primary.result?.allied ?? null, resultAxis: primary.result?.axis ?? null,
        valkyriaSide: primary.valkyriaSide, teams: primary.teams, players: primary.players, publishPlayers: true, observedAt: new Date(primary.observedAt),
      });
      for (const [index, snapshot] of snapshots.slice(1).entries()) await tx.insert(legacyMatchScoreboard).values({ matchId: created.id, ordinal: index + 2, snapshot });
    }
    if (context.options.publish) {
      await publishProse(tx, IMPORT_ACTOR, { owner: { kind: 'match', id: created.id }, locale: 'cs', expectedVersion: prose.version });
      version = (await publishMatch(tx, IMPORT_ACTOR, { id: created.id, expectedVersion: version })).version;
    }
    await recordIdentity(tx, context, identity, { matchId: created.id, importedVersion: version });
    return { ...base, action: 'create', targetId: created.id };
  });
}
