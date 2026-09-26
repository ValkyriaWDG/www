import {
  asset,
  contentDocument,
  contentRevision,
  contentTranslation,
  match,
  matchResult,
  matchRound,
  memberProfile,
  proseRevision,
  proseTranslation,
  publicationSchedule,
  taxonomyTerm,
  type CoverSnapshot,
  type Database,
  type Executor,
  type Locale,
  type RichTextDocument,
} from '@valkyria/db';
import { and, eq, inArray, like, or } from 'drizzle-orm';
import { DEFAULT_MATCH_TIME_ZONE, zonedDate, zonedLocalToInstant } from '../modules/matches/time';
import { ensureSeedTaxonomy } from '../seed/index';
import { imageAssetIds, SEED_RICH_TEXT_SCHEMA_VERSION } from '../seed/rich-text';
import { SEED_CATEGORIES } from '../seed/taxonomy';
import {
  FIXTURE_ASSET_IDS,
  FIXTURE_IMAGES,
  FIXTURE_MATCHES,
  FIXTURE_MEMBERS,
  FIXTURE_NEWS,
  FIXTURE_TAGS,
  matchRecap,
  memberBio,
  type FixtureMatch,
  type FixtureNews,
} from './data';
import { createFixtureAsset, FIXTURE_FILENAME_PREFIX, FIXTURE_PROVENANCE, removeFixtureFiles, resolveMediaRoot } from './images';

export { FIXTURE_ASSET_IDS, FIXTURE_SLUGS } from './data';
export { resolveMediaRoot } from './images';

export type FixtureReport = {
  assets: number;
  members: number;
  matches: number;
  news: number;
  newsTranslations: number;
  schedules: number;
  prose: number;
};

export type ResetReport = { documents: number; matches: number; members: number; tags: number; assets: number };

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
    const documents = await tx.delete(contentDocument).where(eq(contentDocument.isFixture, true)).returning({ id: contentDocument.id });
    const matches = await tx.delete(match).where(eq(match.isFixture, true)).returning({ id: match.id });
    const members = await tx.delete(memberProfile).where(eq(memberProfile.isFixture, true)).returning({ id: memberProfile.id });
    const tags = await tx
      .delete(taxonomyTerm)
      .where(and(eq(taxonomyTerm.kind, 'tag'), like(taxonomyTerm.key, 'fixture-%')))
      .returning({ id: taxonomyTerm.id });
    const assetIds = await fixtureAssetIds(tx);
    if (assetIds.length > 0) await tx.delete(asset).where(inArray(asset.id, assetIds));
    return { documents: documents.length, matches: matches.length, members: members.length, tags: tags.length, assets: assetIds };
  });
  await removeFixtureFiles(mediaRoot, [...new Set([...report.assets, ...Object.values(FIXTURE_ASSET_IDS)])]);
  return { ...report, assets: report.assets.length };
}

async function insertProse(
  tx: Executor,
  owner: { memberProfileId?: string; matchId?: string },
  locale: Locale,
  body: RichTextDocument,
  published: boolean,
  now: Date,
  cover: CoverSnapshot | null = null,
) {
  const [translation] = await tx
    .insert(proseTranslation)
    .values({ memberProfileId: owner.memberProfileId ?? null, matchId: owner.matchId ?? null, locale })
    .returning({ id: proseTranslation.id });
  const assetIds = [...new Set([...imageAssetIds(body), ...(cover ? [cover.assetId] : [])])];
  const [revision] = await tx
    .insert(proseRevision)
    .values({
      proseTranslationId: translation!.id,
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
    .where(eq(proseTranslation.id, translation!.id));
}

async function insertMembers(tx: Executor, now: Date) {
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
      await insertProse(tx, { memberProfileId: row!.id }, locale, memberBio(fixture, locale), bio.published, now);
      prose += 1;
    }
  }
  return prose;
}

function matchStart(fixture: FixtureMatch, now: Date): Date {
  return 'instant' in fixture.start ? new Date(fixture.start.instant) : pragueAt(now, fixture.start.days, fixture.start.time);
}

async function insertMatches(tx: Executor, now: Date) {
  let prose = 0;
  for (const fixture of FIXTURE_MATCHES) {
    const [row] = await tx
      .insert(match)
      .values({
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
      })
      .returning({ id: match.id });
    if (fixture.result) await tx.insert(matchResult).values({ matchId: row!.id, ...fixture.result });
    if (fixture.rounds?.length) {
      await tx.insert(matchRound).values(fixture.rounds.map((round, index) => ({ matchId: row!.id, ordinal: index + 1, ...round })));
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
      await insertProse(tx, { matchId: row!.id }, locale, matchRecap(fixture, locale), recap.published, now, cover);
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

/**
 * Replaces the synthetic fixture set (reset first, so repeated loads are idempotent and
 * relative dates are refreshed). Requires the caller to have passed `assertFixturesAllowed`.
 */
export async function loadFixtures(db: Database, options: { now?: Date; mediaRoot?: string } = {}): Promise<FixtureReport> {
  const now = options.now ?? new Date();
  const mediaRoot = options.mediaRoot ?? resolveMediaRoot();
  await resetFixtures(db, { mediaRoot });
  await db.transaction(async (tx) => {
    await ensureSeedTaxonomy(tx);
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
    const memberProse = await insertMembers(tx, now);
    const matchProse = await insertMatches(tx, now);
    let newsTranslations = 0;
    let schedules = 0;
    for (const fixture of FIXTURE_NEWS) {
      const counts = await insertNews(tx, fixture, now);
      newsTranslations += counts.translations;
      schedules += counts.schedules;
    }
    return {
      assets: FIXTURE_IMAGES.length,
      members: FIXTURE_MEMBERS.length,
      matches: FIXTURE_MATCHES.length,
      news: FIXTURE_NEWS.length,
      newsTranslations,
      schedules,
      prose: memberProse + matchProse,
    };
  });
}
