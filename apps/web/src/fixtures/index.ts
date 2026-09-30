import {
  asset,
  contentDocument,
  contentRevision,
  contentTranslation,
  manualArticle,
  legacyImport,
  match,
  matchStatistics,
  matchResult,
  matchRound,
  memberProfile,
  proseRevision,
  proseTranslation,
  publicationSchedule,
  taxonomyTerm,
  tournament,
  type CoverSnapshot,
  type Database,
  type Executor,
  type Locale,
  type RichTextDocument,
} from '@valkyria/db';
import { and, eq, getTableColumns, getTableName, inArray, like, or, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { parseCrconScoreboard, summarizeTeams } from '../modules/matches/statistics';
import { syntheticScoreboard } from '../modules/matches/statistics-fixtures';
import { DEFAULT_MATCH_TIME_ZONE, zonedDate, zonedLocalToInstant } from '../modules/matches/time';
import { ensureSeedTaxonomy } from '../seed/index';
import { imageAssetIds, SEED_RICH_TEXT_SCHEMA_VERSION } from '../seed/rich-text';
import { SEED_CATEGORIES, SEED_MANUAL_CATEGORIES } from '../seed/taxonomy';
import {
  FIXTURE_ASSET_IDS,
  FIXTURE_IMAGES,
  FIXTURE_MATCHES,
  FIXTURE_MEMBERS,
  FIXTURE_MANUAL,
  FIXTURE_MANUAL_SLUGS,
  FIXTURE_NEWS,
  FIXTURE_SLUGS,
  FIXTURE_TAGS,
  FIXTURE_TOURNAMENTS,
  matchRecap,
  memberBio,
  tournamentDescription,
  type FixtureManual,
  type FixtureMatch,
  type FixtureNews,
} from './data';
import { createFixtureAsset, FIXTURE_FILENAME_PREFIX, FIXTURE_PROVENANCE, removeFixtureFiles, resolveMediaRoot } from './images';
import { FIXTURE_EDITORIAL_KEYS, FIXTURE_LEGACY_MATCH_DETAILS, fixtureEditorialDetails } from './legacy';
import { sourceHash } from '../modules/legacy/import-contract';

export { FIXTURE_ASSET_IDS, FIXTURE_MANUAL_SLUGS, FIXTURE_SLUGS } from './data';
export { resolveMediaRoot } from './images';

export type FixtureReport = {
  assets: number;
  members: number;
  matches: number;
  news: number;
  newsTranslations: number;
  manual: number;
  manualTranslations: number;
  /** Matches with imported (synthetic) game statistics. */
  statistics: number;
  tournaments: number;
  schedules: number;
  prose: number;
  /** Fixture groups left out because the connected schema cannot store them. */
  skipped: string[];
};

/** Loading needs tables that the connected database schema does not have. */
export class FixtureSchemaError extends Error {}

export type ResetReport = { documents: number; matches: number; members: number; tournaments: number; tags: number; assets: number };

const DAY = 24 * 60 * 60 * 1000;
const FIXTURE_LABEL = 'fixtures';

function pragueAt(now: Date, days: number, time: string): Date {
  const date = zonedDate(new Date(now.getTime() + days * DAY), DEFAULT_MATCH_TIME_ZONE);
  return zonedLocalToInstant(`${date}T${time}`, DEFAULT_MATCH_TIME_ZONE);
}

async function fixtureAssetIds(db: Executor): Promise<string[]> {
  const rows = await db
    .select({ id: asset.id })
    .from(asset)
    .where(
      or(
        inArray(asset.id, Object.values(FIXTURE_ASSET_IDS)),
        and(like(asset.originalFilename, `${FIXTURE_FILENAME_PREFIX}%`), eq(asset.provenance, FIXTURE_PROVENANCE)),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Removes only synthetic fixture data: rows flagged `is_fixture` (with their cascading
 * translations, revisions, schedules, prose, results and rounds), `fixture-*` tags and the
 * generated fixture assets plus their files. Seeded pages/categories and admin data stay.
 */
export async function resetFixtures(db: Database, options: { mediaRoot?: string } = {}): Promise<ResetReport> {
  const mediaRoot = options.mediaRoot ?? resolveMediaRoot();
  const report = await db.transaction(async (tx) => {
    // These synthetic ledger rows decorate seeded pages without modifying their editorial revisions.
    if ((await knownColumns(tx, ['legacy_import'])).has('legacy_import')) {
      await tx.delete(legacyImport).where(and(
        eq(legacyImport.sourceOrigin, 'https://valkyriahll.cz'), eq(legacyImport.locale, 'cs'),
        inArray(legacyImport.sourceKind, ['page', 'manual']), inArray(legacyImport.sourceKey, [...FIXTURE_EDITORIAL_KEYS]),
      ));
    }
    const documents = await tx.delete(contentDocument).where(eq(contentDocument.isFixture, true)).returning({ id: contentDocument.id });
    const matches = await tx.delete(match).where(eq(match.isFixture, true)).returning({ id: match.id });
    // An older schema (release rollback rehearsal) has no tournament table yet.
    const tournaments = (await schemaSupport(tx)).tournaments
      ? await tx.delete(tournament).where(eq(tournament.isFixture, true)).returning({ id: tournament.id })
      : [];
    const members = await tx.delete(memberProfile).where(eq(memberProfile.isFixture, true)).returning({ id: memberProfile.id });
    const tags = await tx
      .delete(taxonomyTerm)
      .where(and(eq(taxonomyTerm.kind, 'tag'), like(taxonomyTerm.key, 'fixture-%')))
      .returning({ id: taxonomyTerm.id });
    const assetIds = await fixtureAssetIds(tx);
    if (assetIds.length > 0) await tx.delete(asset).where(inArray(asset.id, assetIds));
    return { documents: documents.length, matches: matches.length, members: members.length, tournaments: tournaments.length, tags: tags.length, assets: assetIds };
  });
  await removeFixtureFiles(mediaRoot, [...new Set([...report.assets, ...Object.values(FIXTURE_ASSET_IDS)])]);
  return { ...report, assets: report.assets.length };
}

/** Columns per table of the connected schema, for tables whose newer columns an older schema lacks. */
type KnownColumns = ReadonlyMap<string, ReadonlySet<string>>;

async function knownColumns(db: Executor, tables: string[]): Promise<KnownColumns> {
  const result = await db.execute<{ table_name: string; column_name: string }>(
    sql`select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in (${sql.join(tables.map((table) => sql`${table}`), sql`, `)})`,
  );
  const map = new Map<string, Set<string>>();
  for (const row of result.rows) map.set(row.table_name, (map.get(row.table_name) ?? new Set()).add(row.column_name));
  return map;
}

/**
 * Inserts one row with only the columns the connected schema has, so the candidate
 * fixture CLI can load into the previous image's schema before newer nullable columns
 * (for example `match.tournament_id`) exist. Values are encoded by the column mappers.
 */
async function insertKnown(tx: Executor, table: PgTable, values: Record<string, unknown>, known: KnownColumns): Promise<string> {
  const columns = known.get(getTableName(table));
  const entries = Object.entries(getTableColumns(table)).filter(([key, column]) => values[key] !== undefined && (!columns || columns.has(column.name)));
  const result = await tx.execute<{ id: string }>(
    sql`insert into ${table} (${sql.join(entries.map(([, column]) => sql.identifier(column.name)), sql`, `)}) values (${sql.join(
      entries.map(([key, column]) => sql.param(values[key], column)),
      sql`, `,
    )}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertProse(
  tx: Executor,
  known: KnownColumns,
  owner: { memberProfileId?: string; matchId?: string; tournamentId?: string },
  locale: Locale,
  body: RichTextDocument,
  published: boolean,
  now: Date,
  cover: CoverSnapshot | null = null,
) {
  const translationId = await insertKnown(
    tx,
    proseTranslation,
    { memberProfileId: owner.memberProfileId ?? null, matchId: owner.matchId ?? null, tournamentId: owner.tournamentId, locale },
    known,
  );
  const translation = { id: translationId };
  const assetIds = [...new Set([...imageAssetIds(body), ...(cover ? [cover.assetId] : [])])];
  const [revision] = await tx
    .insert(proseRevision)
    .values({
      proseTranslationId: translation.id,
      locale,
      kind: 'save',
      schemaVersion: SEED_RICH_TEXT_SCHEMA_VERSION,
      body,
      cover,
      assetIds,
      createdByLabel: FIXTURE_LABEL,
    })
    .returning({ id: proseRevision.id });
  await tx
    .update(proseTranslation)
    .set({ draftRevisionId: revision!.id, ...(published ? { publishedRevisionId: revision!.id, publishedAt: now } : {}) })
    .where(eq(proseTranslation.id, translation.id));
}

async function insertMembers(tx: Executor, now: Date, known: KnownColumns) {
  let prose = 0;
  for (const fixture of FIXTURE_MEMBERS) {
    const [row] = await tx
      .insert(memberProfile)
      .values({
        slug: fixture.slug,
        displayName: fixture.displayName,
        avatarAssetId: fixture.avatar ? FIXTURE_ASSET_IDS.memberAvatar : null,
        games: fixture.games,
        publicRoleKeys: fixture.publicRoleKeys,
        state: fixture.state,
        consentConfirmedAt: fixture.consent ? new Date(now.getTime() - 30 * DAY) : null,
        publishedAt: fixture.state === 'draft' ? null : new Date(now.getTime() - 29 * DAY),
        sortOrder: fixture.sortOrder,
        isFixture: true,
      })
      .returning({ id: memberProfile.id });
    for (const [locale, bio] of Object.entries(fixture.bio) as [Locale, { published: boolean }][]) {
      await insertProse(tx, known, { memberProfileId: row!.id }, locale, memberBio(fixture, locale), bio.published, now);
      prose += 1;
    }
  }
  return prose;
}

function matchStart(fixture: FixtureMatch, now: Date): Date {
  return 'instant' in fixture.start ? new Date(fixture.start.instant) : pragueAt(now, fixture.start.days, fixture.start.time);
}

/** Synthetic imported statistics for the completed HLL fixture (Valkyria as Allies, 3 : 2). */
async function insertStatistics(tx: Executor, matchId: string, now: Date) {
  const parsed = parseCrconScoreboard(syntheticScoreboard({ gameId: 4242, result: { allied: 3, axis: 2 } }))!;
  await tx.insert(matchStatistics).values({
    matchId,
    source: 'upload',
    sourceLabel: 'synthetic-fixture-scoreboard.json',
    externalGameId: parsed.externalGameId,
    mapName: parsed.mapName,
    mode: parsed.mode,
    gameStartedAt: parsed.startedAt,
    gameEndedAt: parsed.endedAt,
    resultAllied: parsed.result?.allied ?? null,
    resultAxis: parsed.result?.axis ?? null,
    valkyriaSide: 'allies',
    teams: summarizeTeams(parsed),
    players: parsed.players,
    publishPlayers: true,
    observedAt: new Date(now.getTime() - DAY),
  });
}

async function insertMatches(tx: Executor, now: Date, options: { statistics: boolean }, known: KnownColumns) {
  let prose = 0;
  let statistics = 0;
  const ids = new Map<string, string>();
  for (const fixture of FIXTURE_MATCHES) {
    const id = await insertKnown(
      tx,
      match,
      {
        slug: fixture.slug,
        game: fixture.game,
        opponentName: fixture.opponentName,
        opponentShortCode: fixture.opponentShortCode,
        opponentLogoAssetId: fixture.logo ? FIXTURE_ASSET_IDS.opponentLogo : null,
        competitionType: fixture.competitionType,
        competitionName: fixture.competitionName,
        season: fixture.season,
        bestOf: fixture.bestOf,
        startsAt: matchStart(fixture, now),
        timeZone: DEFAULT_MATCH_TIME_ZONE,
        originalStartsAt: fixture.originalStart ? pragueAt(now, fixture.originalStart.days, fixture.originalStart.time) : null,
        status: fixture.status,
        publication: fixture.published ? 'published' : 'draft',
        publishedAt: fixture.published ? new Date(now.getTime() - DAY) : null,
        eventUrl: fixture.eventUrl,
        vodLinks: fixture.vodLinks,
        coverAssetId: fixture.cover ? FIXTURE_ASSET_IDS.matchCover : null,
        internalNotes: fixture.internalNotes,
        isFixture: true,
      },
      known,
    );
    const row = { id };
    ids.set(fixture.slug, id);
    if (fixture.slug === FIXTURE_SLUGS.matches.hllHistorical && known.get('legacy_import')?.has('source_metadata')) {
      await tx.insert(legacyImport).values({
        sourceOrigin: 'https://valkyriahll.cz', sourceKind: 'match', sourceKey: 'synthetic-fixture',
        sourceUrl: 'https://valkyriahll.cz/matches/900001', sourceSha256: '0'.repeat(64),
        sourceMetadata: { matchDetails: FIXTURE_LEGACY_MATCH_DETAILS, matchDetailsSha256: sourceHash(FIXTURE_LEGACY_MATCH_DETAILS), privateOperatorNote: 'SYNTHETIC-NOT-PUBLIC' },
        matchId: id, observedAt: now,
      });
    }
    if (fixture.result) await tx.insert(matchResult).values({ matchId: row.id, ...fixture.result });
    if (fixture.rounds?.length) {
      await tx.insert(matchRound).values(fixture.rounds.map((round, index) => ({ matchId: row.id, ordinal: index + 1, ...round })));
    }
    if (options.statistics && fixture.slug === FIXTURE_SLUGS.matches.hllHistorical) {
      await insertStatistics(tx, row.id, now);
      statistics += 1;
    }
    for (const [locale, recap] of Object.entries(fixture.recap) as [Locale, { published: boolean }][]) {
      const cover: CoverSnapshot | null = fixture.cover
        ? {
            assetId: FIXTURE_ASSET_IDS.matchCover,
            alt: locale === 'cs' ? 'Syntetický titulní obrázek zápasu' : 'Synthetic match cover image',
            caption: locale === 'cs' ? '[Ukázka] Syntetický popisek' : '[Sample] Synthetic caption',
            decorative: false,
          }
        : null;
      await insertProse(tx, known, { matchId: row.id }, locale, matchRecap(fixture, locale), recap.published, now, cover);
      prose += 1;
    }
  }
  return { prose, statistics, ids };
}

/** Synthetic tournaments (published current and finished, one draft) with linked fixture matches. */
async function insertTournaments(tx: Executor, now: Date, known: KnownColumns, matchIds: ReadonlyMap<string, string>) {
  let prose = 0;
  const day = (days: number | null) => (days === null ? null : zonedDate(new Date(now.getTime() + days * DAY), DEFAULT_MATCH_TIME_ZONE));
  for (const fixture of FIXTURE_TOURNAMENTS) {
    const [row] = await tx
      .insert(tournament)
      .values({
        slug: fixture.slug,
        game: fixture.game,
        name: fixture.name,
        season: fixture.season,
        organizer: fixture.organizer,
        startsOn: day(fixture.startDays),
        endsOn: day(fixture.endDays),
        links: fixture.links,
        publication: fixture.published ? 'published' : 'draft',
        publishedAt: fixture.published ? new Date(now.getTime() - DAY) : null,
        isFixture: true,
      })
      .returning({ id: tournament.id });
    const linked = fixture.matchSlugs.map((slug) => matchIds.get(slug)).filter((id): id is string => Boolean(id));
    if (linked.length > 0) await tx.update(match).set({ tournamentId: row!.id }).where(inArray(match.id, linked));
    for (const [locale, description] of Object.entries(fixture.description) as [Locale, { published: boolean }][]) {
      await insertProse(tx, known, { tournamentId: row!.id }, locale, tournamentDescription(fixture, locale), description.published, now);
      prose += 1;
    }
  }
  return prose;
}

function taxonomyLabel(key: string, kind: 'category' | 'tag', locale: Locale): string {
  const source = kind === 'category' ? SEED_CATEGORIES.find((c) => c.key === key) : FIXTURE_TAGS.find((t) => t.key === key);
  return source ? (locale === 'cs' ? source.labelCs : source.labelEn) : key;
}

async function insertNews(tx: Executor, fixture: FixtureNews, now: Date) {
  const at = new Date(now.getTime() - fixture.days * DAY);
  const [document] = await tx
    .insert(contentDocument)
    .values({
      kind: 'news',
      game: fixture.game,
      categoryKey: fixture.category,
      tagKeys: [...fixture.tags],
      isFixture: true,
      archivedAt: fixture.archived ? at : null,
      createdAt: at,
      updatedAt: at,
    })
    .returning({ id: contentDocument.id });
  let translations = 0;
  let schedules = 0;
  for (const [locale, copy] of Object.entries(fixture.translations) as [Locale, NonNullable<FixtureNews['translations'][Locale]>][]) {
    const cover: CoverSnapshot | null = copy.cover
      ? {
          assetId: FIXTURE_ASSET_IDS.newsCover,
          alt: locale === 'cs' ? 'Syntetický titulní obrázek s nápisem SYNTHETIC FIXTURE' : 'Synthetic cover image reading SYNTHETIC FIXTURE',
          caption: locale === 'cs' ? '[Ukázka] Syntetický titulní obrázek' : '[Sample] Synthetic cover image',
          decorative: false,
        }
      : null;
    const [translation] = await tx
      .insert(contentTranslation)
      .values({ documentId: document!.id, locale, namespace: 'news', draftSlug: copy.slug, createdAt: at, updatedAt: at })
      .returning({ id: contentTranslation.id });
    const [revision] = await tx
      .insert(contentRevision)
      .values({
        translationId: translation!.id,
        locale,
        kind: 'save',
        schemaVersion: SEED_RICH_TEXT_SCHEMA_VERSION,
        title: copy.title,
        slug: copy.slug,
        excerpt: copy.excerpt,
        body: copy.body,
        cover,
        taxonomy: {
          category: { key: fixture.category, label: taxonomyLabel(fixture.category, 'category', locale) },
          tags: fixture.tags.map((key) => ({ key, label: taxonomyLabel(key, 'tag', locale) })),
          game: fixture.game,
        },
        authorLabel: locale === 'cs' ? 'Syntetický autor' : 'Synthetic author',
        seoTitle: '',
        seoDescription: '',
        assetIds: [...new Set([...imageAssetIds(copy.body), ...(cover ? [cover.assetId] : [])])],
        createdByLabel: FIXTURE_LABEL,
        createdAt: at,
      })
      .returning({ id: contentRevision.id });
    const live = copy.state === 'published' && !fixture.archived;
    await tx
      .update(contentTranslation)
      .set({
        draftRevisionId: revision!.id,
        ...(live ? { publishedRevisionId: revision!.id, liveSlug: copy.slug, publishedAt: at } : {}),
        ...(copy.state === 'published' ? { firstPublishedAt: at } : {}),
        ...(fixture.archived ? { archivedAt: at } : {}),
      })
      .where(eq(contentTranslation.id, translation!.id));
    if (copy.state === 'scheduled') {
      await tx.insert(publicationSchedule).values({
        translationId: translation!.id,
        locale,
        revisionId: revision!.id,
        dueAt: new Date(now.getTime() + Math.abs(fixture.days) * DAY),
        timeZone: DEFAULT_MATCH_TIME_ZONE,
        state: 'pending',
        issuerKind: 'discord',
        issuerLabel: 'Syntetický editor',
        issuerAssurance: 'discord',
        capability: 'content.publish',
        idempotencyKey: `fixture:${translation!.id}:${revision!.id}`,
      });
      schedules += 1;
    }
    translations += 1;
  }
  return { translations, schedules };
}

async function insertManual(tx: Executor, fixture: FixtureManual, now: Date): Promise<number> {
  const at = new Date(now.getTime() - fixture.days * DAY);
  const category = SEED_MANUAL_CATEGORIES.find((entry) => entry.key === fixture.category)!;
  const [document] = await tx
    .insert(contentDocument)
    .values({ kind: 'manual', game: 'hell-let-loose', categoryKey: fixture.category, tagKeys: [], isFixture: true, createdAt: at, updatedAt: at })
    .returning({ id: contentDocument.id });
  await tx.insert(manualArticle).values({
    documentId: document!.id,
    sortOrder: fixture.sortOrder,
    sourceUrl: fixture.meta.sourceUrl,
    sourcePublishedOn: fixture.meta.sourcePublishedOn,
    sourceLanguage: fixture.meta.sourceLanguage,
    credits: fixture.meta.credits,
    reviewedAt: fixture.meta.reviewed ? at : null,
  });
  let translations = 0;
  for (const [locale, copy] of Object.entries(fixture.translations) as [Locale, NonNullable<FixtureManual['translations'][Locale]>][]) {
    const cover: CoverSnapshot | null = copy.cover
      ? {
          assetId: FIXTURE_ASSET_IDS.newsCover,
          alt: locale === 'cs' ? 'Syntetický titulní obrázek s nápisem SYNTHETIC FIXTURE' : 'Synthetic cover image reading SYNTHETIC FIXTURE',
          caption: '',
          decorative: false,
        }
      : null;
    const [translation] = await tx
      .insert(contentTranslation)
      .values({ documentId: document!.id, locale, namespace: 'manual', draftSlug: copy.slug, createdAt: at, updatedAt: at })
      .returning({ id: contentTranslation.id });
    const [revision] = await tx
      .insert(contentRevision)
      .values({
        translationId: translation!.id,
        locale,
        kind: 'save',
        schemaVersion: SEED_RICH_TEXT_SCHEMA_VERSION,
        title: copy.title,
        slug: copy.slug,
        excerpt: copy.excerpt,
        body: copy.body,
        cover,
        taxonomy: { category: { key: category.key, label: locale === 'cs' ? category.labelCs : category.labelEn }, tags: [], game: 'hell-let-loose' },
        authorLabel: locale === 'cs' ? 'Syntetický autor' : 'Synthetic author',
        seoTitle: '',
        seoDescription: '',
        assetIds: [...new Set([...imageAssetIds(copy.body), ...(cover ? [cover.assetId] : [])])],
        createdByLabel: FIXTURE_LABEL,
        createdAt: at,
      })
      .returning({ id: contentRevision.id });
    const live = copy.state === 'published';
    await tx
      .update(contentTranslation)
      .set({ draftRevisionId: revision!.id, ...(live ? { publishedRevisionId: revision!.id, liveSlug: copy.slug, publishedAt: at, firstPublishedAt: at } : {}) })
      .where(eq(contentTranslation.id, translation!.id));
    translations += 1;
  }
  return translations;
}

async function insertEditorialArchives(tx: Executor, now: Date) {
  const owners = await tx.select({ id: contentTranslation.id, pageKey: contentDocument.pageKey, kind: contentDocument.kind })
    .from(contentTranslation).innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .where(and(eq(contentTranslation.locale, 'cs'), or(
      and(eq(contentDocument.kind, 'page'), inArray(contentDocument.pageKey, ['clan', 'faq'])),
      and(eq(contentDocument.kind, 'manual'), eq(contentDocument.isFixture, true), eq(contentTranslation.draftSlug, FIXTURE_MANUAL_SLUGS.setupCs)),
    )));
  for (const owner of owners) {
    const kind = owner.kind === 'page' ? 'page' : 'manual';
    const key = kind === 'page' ? owner.pageKey! : 'manual-setup';
    const details = fixtureEditorialDetails(kind, key);
    await tx.insert(legacyImport).values({
      sourceOrigin: 'https://valkyriahll.cz', sourceKind: kind, sourceKey: `synthetic-editorial-fixture:${key}`,
      locale: 'cs', sourceUrl: details.sourceUrl, sourceSha256: sourceHash(details), translationId: owner.id,
      sourceMetadata: { archiveEditorial: details, archiveEditorialSha256: sourceHash(details), privateOperatorNote: 'SYNTHETIC-NOT-PUBLIC' },
      observedAt: now,
    });
  }
}

/** Which optional fixture groups the connected schema can store. */
async function schemaSupport(db: Executor): Promise<{ manual: boolean; statistics: boolean; tournaments: boolean }> {
  const result = await db.execute<{ manual: boolean; statistics: boolean; tournaments: boolean }>(
    sql`select to_regclass('public.manual_category') is not null and to_regclass('public.manual_article') is not null as manual,
               to_regclass('public.match_statistics') is not null as statistics,
               to_regclass('public.tournament') is not null as tournaments`,
  );
  const row = result.rows[0];
  return { manual: row?.manual === true, statistics: row?.statistics === true, tournaments: row?.tournaments === true };
}

/**
 * Replaces the synthetic fixture set (reset first, so repeated loads are idempotent and
 * relative dates are refreshed). Requires the caller to have passed `assertFixturesAllowed`.
 * A schema without the field manual, match statistics or tournament tables fails, unless `schemaCompatible` is set: the
 * release rollback rehearsal loads an older image's schema that way, and the groups the
 * schema cannot store are left out and named in `skipped`.
 */
export async function loadFixtures(
  db: Database,
  options: { now?: Date; mediaRoot?: string; schemaCompatible?: boolean } = {},
): Promise<FixtureReport> {
  const now = options.now ?? new Date();
  const mediaRoot = options.mediaRoot ?? resolveMediaRoot();
  const support = await schemaSupport(db);
  const manualSchema = support.manual;
  if ((!support.manual || !support.statistics || !support.tournaments) && !options.schemaCompatible)
    throw new FixtureSchemaError('The field manual, match statistics or tournament tables are missing; apply the database migrations first.');
  await resetFixtures(db, { mediaRoot });
  await db.transaction(async (tx) => {
    await ensureSeedTaxonomy(tx, undefined, { manual: manualSchema });
    await tx
      .insert(taxonomyTerm)
      .values(FIXTURE_TAGS.map((tag) => ({ kind: 'tag' as const, key: tag.key, labelCs: tag.labelCs, labelEn: tag.labelEn })))
      .onConflictDoNothing({ target: [taxonomyTerm.kind, taxonomyTerm.key] });
  });
  // Files are written before the rows that reference them; a failed load is cleaned by --reset.
  await db.transaction(async (tx) => {
    for (const spec of FIXTURE_IMAGES) await createFixtureAsset(tx, spec, mediaRoot);
  });
  return db.transaction(async (tx) => {
    const known = await knownColumns(tx, ['match', 'prose_translation', 'legacy_import']);
    const memberProse = await insertMembers(tx, now, known);
    const matchRows = await insertMatches(tx, now, { statistics: support.statistics }, known);
    const tournamentProse = support.tournaments ? await insertTournaments(tx, now, known, matchRows.ids) : 0;
    let newsTranslations = 0;
    let schedules = 0;
    for (const fixture of FIXTURE_NEWS) {
      const counts = await insertNews(tx, fixture, now);
      newsTranslations += counts.translations;
      schedules += counts.schedules;
    }
    let manualTranslations = 0;
    const manualFixtures = manualSchema ? FIXTURE_MANUAL : [];
    for (const fixture of manualFixtures) manualTranslations += await insertManual(tx, fixture, now);
    if (known.get('legacy_import')?.has('source_metadata')) await insertEditorialArchives(tx, now);
    return {
      manual: manualFixtures.length,
      manualTranslations,
      statistics: matchRows.statistics,
      tournaments: support.tournaments ? FIXTURE_TOURNAMENTS.length : 0,
      skipped: [...(manualSchema ? [] : ['field manual']), ...(support.statistics ? [] : ['match statistics']), ...(support.tournaments ? [] : ['tournaments'])],
      assets: FIXTURE_IMAGES.length,
      members: FIXTURE_MEMBERS.length,
      matches: FIXTURE_MATCHES.length,
      news: FIXTURE_NEWS.length,
      newsTranslations,
      schedules,
      prose: memberProse + matchRows.prose + tournamentProse,
    };
  });
}
