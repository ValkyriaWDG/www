import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  asset,
  contentDocument,
  contentRevision,
  contentTranslation,
  match,
  memberProfile,
  proseRevision,
  publicationSchedule,
  taxonomyTerm,
} from '@valkyria/db';
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXTURE_IMAGES, FIXTURE_MEMBERS } from '@/fixtures/data';
import { renderFixturePng } from '@/fixtures/images';
import { FIXTURE_ASSET_IDS, FIXTURE_SLUGS, loadFixtures, resetFixtures } from '@/fixtures/index';
import { ensureTestActors } from '@/fixtures/test-actors';
import { parseRichTextDocument } from '@/modules/content/rich-text/schema';
import { getPublicMatch, listPublicMatches } from '@/modules/matches/queries';
import { createMatch, publishMatch } from '@/modules/matches/service';
import { getPublicMember, listPublicMembers } from '@/modules/members/queries';
import { createMemberProfile } from '@/modules/members/service';
import { runSeed } from '@/seed/index';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

const run = promisify(execFile);
const appRoot = path.resolve(import.meta.dirname, '../..');
const tsxCli = path.join(appRoot, 'node_modules/tsx/dist/cli.mjs');

let t: TestDatabase;
let mediaRoot: string;

beforeAll(async () => {
  t = await createTestDatabase();
  mediaRoot = await mkdtemp(path.join(tmpdir(), 'valkyria-fixture-media-'));
  await runSeed(t.db);
  await loadFixtures(t.db, { mediaRoot });
});
afterAll(async () => {
  await t.drop();
  await rm(mediaRoot, { recursive: true, force: true });
});

describe('synthetic fixture set', () => {
  it('writes generated images in the shared storage layout', async () => {
    const rows = await t.db.select().from(asset);
    expect(rows.map((row) => row.id).sort()).toEqual(Object.values(FIXTURE_ASSET_IDS).sort());
    for (const row of rows) {
      expect(row).toMatchObject({ state: 'ready', sourceFormat: 'png' });
      expect(row.originalFilename.startsWith('synthetic-fixture-')).toBe(true);
      const spec = FIXTURE_IMAGES.find((image) => image.id === row.id)!;
      const source = await renderFixturePng(spec);
      expect(row.sha256).toBe(createHash('sha256').update(source).digest('hex'));
      for (const [name, limit] of [
        ['full', 2400],
        ['thumb', 480],
      ] as const) {
        const variant = row.variants![name];
        expect(variant.key).toBe(`${row.id}/${name}.webp`);
        const file = path.join(mediaRoot, variant.key);
        // Buffer input avoids libvips retaining a Windows file handle across fixture reset.
        const meta = await sharp(await readFile(file)).metadata();
        expect(meta.format).toBe('webp');
        expect([meta.width, meta.height]).toEqual([variant.width, variant.height]);
        expect(Math.max(variant.width, variant.height)).toBeLessThanOrEqual(limit);
      }
    }
    expect(rows.find((row) => row.id === FIXTURE_ASSET_IDS.opponentLogo)?.scope).toBe('match');
  });

  it('marks every fixture row and uses obviously synthetic names and titles', async () => {
    const members = await t.db.select().from(memberProfile);
    expect(members.every((row) => row.isFixture)).toBe(true);
    expect(members.every((row) => row.displayName.startsWith('Syntetick'))).toBe(true);
    const matches = await t.db.select().from(match);
    expect(matches.every((row) => row.isFixture && row.opponentName.startsWith('Synthetic'))).toBe(true);
    const news = await t.db.select().from(contentDocument).where(eq(contentDocument.kind, 'news'));
    expect(news.every((row) => row.isFixture)).toBe(true);
    const revisions = await t.db
      .select({ title: contentRevision.title, locale: contentRevision.locale })
      .from(contentRevision)
      .innerJoin(contentTranslation, eq(contentTranslation.id, contentRevision.translationId))
      .where(eq(contentTranslation.namespace, 'news'));
    for (const revision of revisions) expect(revision.title.startsWith(revision.locale === 'cs' ? '[Ukázka]' : '[Sample]')).toBe(true);
  });

  it('produces only valid v1 rich-text bodies', async () => {
    for (const row of await t.db.select({ body: contentRevision.body }).from(contentRevision)) {
      const result = parseRichTextDocument(row.body);
      expect(result.ok ? [] : result.issues).toEqual([]);
    }
    for (const row of await t.db.select({ body: proseRevision.body }).from(proseRevision)) {
      const result = parseRichTextDocument(row.body);
      expect(result.ok ? [] : result.issues).toEqual([]);
    }
  });

  it('covers the member publication and biography states', async () => {
    const listed = await listPublicMembers(t.db, { pageSize: 50 });
    expect(listed.items.map((m) => m.slug)).toEqual([
      FIXTURE_SLUGS.members.publishedBilingual,
      FIXTURE_SLUGS.members.publishedCsOnlyBio,
      FIXTURE_SLUGS.members.longName,
      FIXTURE_SLUGS.members.emoji,
    ]);
    expect(await getPublicMember(t.db, FIXTURE_SLUGS.members.draft, 'cs')).toBeNull();
    expect(await getPublicMember(t.db, FIXTURE_SLUGS.members.hidden, 'cs')).toBeNull();
    expect((await getPublicMember(t.db, FIXTURE_SLUGS.members.publishedCsOnlyBio, 'en'))?.biography).toEqual({ state: 'missing', availableIn: ['cs'] });
    expect((await getPublicMember(t.db, FIXTURE_SLUGS.members.publishedBilingual, 'en'))?.biography.state).toBe('published');
    expect((await getPublicMember(t.db, FIXTURE_SLUGS.members.publishedBilingual, 'cs'))?.avatar?.assetId).toBe(FIXTURE_ASSET_IDS.memberAvatar);
    expect((await getPublicMember(t.db, FIXTURE_SLUGS.members.publishedCsOnlyBio, 'cs'))?.avatar).toBeNull();
    for (const slug of [FIXTURE_SLUGS.members.longName, FIXTURE_SLUGS.members.emoji]) {
      const expected = FIXTURE_MEMBERS.find((m) => m.slug === slug)!.displayName;
      expect(Buffer.from((await getPublicMember(t.db, slug, 'cs'))!.displayName)).toEqual(Buffer.from(expected));
    }
    expect([...FIXTURE_MEMBERS.find((m) => m.slug === FIXTURE_SLUGS.members.longName)!.displayName].length).toBe(80);
  });

  it('covers the match states and keeps drafts, notes and unknown scores private or null', async () => {
    const upcoming = await listPublicMatches(t.db, { view: 'upcoming' });
    expect(upcoming.items.map((m) => [m.slug, m.status])).toEqual([
      [FIXTURE_SLUGS.matches.upcoming, 'scheduled'],
      [FIXTURE_SLUGS.matches.postponed, 'postponed'],
    ]);
    const next = upcoming.items[0]!;
    const days = (new Date(next.startsAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(5.5);
    expect(days).toBeLessThan(8.5);
    expect(upcoming.items[1]?.originalStartsAt).not.toBeNull();

    const results = await listPublicMatches(t.db, { view: 'results' });
    expect(results.items.map((m) => m.slug)).toEqual([
      FIXTURE_SLUGS.matches.cancelled,
      FIXTURE_SLUGS.matches.completedVerified,
      FIXTURE_SLUGS.matches.completedUnknown,
      FIXTURE_SLUGS.matches.hllHistorical,
    ]);
    const verified = await getPublicMatch(t.db, FIXTURE_SLUGS.matches.completedVerified, 'en');
    expect(verified).toMatchObject({ result: { scoreValkyria: 2, scoreOpponent: 1, outcome: 'win', verification: 'verified' }, recap: { state: 'published' } });
    expect(verified?.rounds).toHaveLength(3);
    expect(verified?.cover?.alt).toBe('Synthetic match cover image');
    const unknown = await getPublicMatch(t.db, FIXTURE_SLUGS.matches.completedUnknown, 'en');
    expect(unknown?.result).toEqual({ scoreValkyria: null, scoreOpponent: null, outcome: 'unknown', verification: 'provisional' });
    expect(unknown?.recap).toEqual({ state: 'missing', availableIn: ['cs'] });
    expect((await getPublicMatch(t.db, FIXTURE_SLUGS.matches.hllHistorical, 'cs'))?.game).toBe('hell-let-loose');
    expect(await getPublicMatch(t.db, FIXTURE_SLUGS.matches.draft, 'cs')).toBeNull();
    const json = JSON.stringify([upcoming, results, verified, unknown]);
    expect(json).not.toContain('Synthetic internal note');
    expect(json).not.toContain(FIXTURE_SLUGS.matches.draft);
  });

  it('covers news publication, missing/draft translations, scheduling, archive and pagination', async () => {
    const live = await t.db
      .select({ locale: contentTranslation.locale, n: count() })
      .from(contentTranslation)
      .where(and(eq(contentTranslation.namespace, 'news'), isNotNull(contentTranslation.publishedRevisionId)))
      .groupBy(contentTranslation.locale);
    expect(live.find((row) => row.locale === 'cs')!.n).toBeGreaterThanOrEqual(14);

    const bySlug = async (slug: string) => (await t.db.select().from(contentTranslation).where(eq(contentTranslation.draftSlug, slug)))[0]!;
    const feature = await bySlug(FIXTURE_SLUGS.news.featureEn);
    expect(feature.liveSlug).toBe(FIXTURE_SLUGS.news.featureEn);
    const [featureRevision] = await t.db.select().from(contentRevision).where(eq(contentRevision.id, feature.publishedRevisionId!));
    expect(featureRevision?.cover?.assetId).toBe(FIXTURE_ASSET_IDS.newsCover);
    expect(featureRevision?.assetIds.sort()).toEqual([FIXTURE_ASSET_IDS.newsCover, FIXTURE_ASSET_IDS.newsInline].sort());
    expect(JSON.stringify(featureRevision?.body)).toContain('"type":"table"');
    expect(JSON.stringify(featureRevision?.body)).toContain('"type":"link"');
    expect(featureRevision?.taxonomy).toEqual({
      category: { key: 'announcement', label: 'Announcement' },
      tags: [
        { key: 'fixture-wardogs', label: 'Sample Wardogs' },
        { key: 'fixture-guide', label: 'Sample guide' },
      ],
      game: 'wardogs',
    });

    const csOnly = await bySlug(FIXTURE_SLUGS.news.csOnly);
    const csOnlyTranslations = await t.db.select().from(contentTranslation).where(eq(contentTranslation.documentId, csOnly.documentId));
    expect(csOnlyTranslations.map((row) => row.locale)).toEqual(['cs']);

    const enDraft = await bySlug(FIXTURE_SLUGS.news.withEnDraftEn);
    expect(enDraft).toMatchObject({ locale: 'en', liveSlug: null, publishedRevisionId: null });
    expect(enDraft.draftRevisionId).not.toBeNull();
    expect((await bySlug(FIXTURE_SLUGS.news.withEnDraftCs)).liveSlug).toBe(FIXTURE_SLUGS.news.withEnDraftCs);

    const scheduled = await bySlug(FIXTURE_SLUGS.news.scheduledCs);
    expect(scheduled.publishedRevisionId).toBeNull();
    const [schedule] = await t.db.select().from(publicationSchedule).where(eq(publicationSchedule.translationId, scheduled.id));
    expect(schedule).toMatchObject({ state: 'pending', locale: 'cs', revisionId: scheduled.draftRevisionId });
    expect(schedule!.dueAt.getTime()).toBeGreaterThan(Date.now());

    const archived = await bySlug(FIXTURE_SLUGS.news.archivedCs);
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.liveSlug).toBeNull();

    const categories = await t.db
      .selectDistinct({ key: contentDocument.categoryKey })
      .from(contentDocument)
      .where(and(eq(contentDocument.kind, 'news'), isNull(contentDocument.archivedAt)));
    expect(categories.map((row) => row.key).sort()).toEqual(['announcement', 'community', 'match-report', 'update']);
  });

  it('reloads idempotently and resets only fixture data', async () => {
    const snapshot = async () => ({
      members: (await t.db.select({ n: count() }).from(memberProfile))[0]!.n,
      matches: (await t.db.select({ n: count() }).from(match))[0]!.n,
      documents: (await t.db.select({ n: count() }).from(contentDocument))[0]!.n,
      assets: (await t.db.select({ n: count() }).from(asset))[0]!.n,
    });
    const before = await snapshot();
    await loadFixtures(t.db, { mediaRoot });
    expect(await snapshot()).toEqual(before);

    const actors = await ensureTestActors(t.db);
    const realMatch = await createMatch(t.db, actors.matchManager, {
      game: 'wardogs',
      opponentName: 'Admin-created opponent',
      competitionType: 'friendly',
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      coverAssetId: FIXTURE_ASSET_IDS.matchCover,
    });
    await publishMatch(t.db, actors.matchManager, { id: realMatch.id, expectedVersion: realMatch.version });
    const realMember = await createMemberProfile(t.db, actors.editor, { displayName: 'Admin-created profile' });

    const removed = await resetFixtures(t.db, { mediaRoot });
    expect(removed).toMatchObject({ members: 6, matches: 7, assets: 5, tags: 3 });
    expect((await t.db.select().from(match)).map((row) => row.id)).toEqual([realMatch.id]);
    expect((await t.db.select().from(match))[0]?.coverAssetId).toBeNull();
    expect((await t.db.select().from(memberProfile)).map((row) => row.id)).toEqual([realMember.id]);
    const documents = await t.db.select().from(contentDocument);
    expect(documents.map((row) => row.pageKey).sort()).toEqual(['clan', 'community', 'faq', 'privacy']);
    expect(await t.db.select().from(asset)).toHaveLength(0);
    expect((await t.db.select().from(taxonomyTerm)).map((row) => row.kind)).toEqual(['category', 'category', 'category', 'category']);
    for (const id of Object.values(FIXTURE_ASSET_IDS)) expect(existsSync(path.join(mediaRoot, id))).toBe(false);
  });
});

describe('fixtures CLI guard', () => {
  it('refuses without the flag and under production for a non dev/test/e2e database, then loads and resets when allowed', async () => {
    const target = await createTestDatabase();
    const media = await mkdtemp(path.join(tmpdir(), 'valkyria-fixture-cli-'));
    const cli = (args: string[], env: Record<string, string>) =>
      run(process.execPath, [tsxCli, 'src/cli/fixtures.ts', ...args], {
        cwd: appRoot,
        env: { ...process.env, DATABASE_URL: target.url, EDITORIAL_MEDIA_ROOT: media, ...env },
      }).then(
        (result) => ({ code: 0, stdout: result.stdout, stderr: result.stderr }),
        (error: { code?: number; stdout?: string; stderr?: string }) => ({ code: error.code ?? -1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }),
      );
    try {
      const noFlag = await cli([], { NODE_ENV: 'development' });
      expect(noFlag.code).toBe(2);
      expect(noFlag.stderr).toContain('--allow-fixtures');

      const production = await cli(['--allow-fixtures'], { NODE_ENV: 'production' });
      expect(production.code).toBe(2);
      expect(production.stderr).toContain('_dev, _test or _e2e');
      expect(await target.db.select().from(match)).toHaveLength(0);

      const loaded = await cli(['--allow-fixtures'], { NODE_ENV: 'test' });
      expect(loaded.stderr).toBe('');
      expect(loaded.code).toBe(0);
      expect(loaded.stdout).toContain('Synthetic fixtures loaded');
      expect(await target.db.select().from(match)).toHaveLength(7);

      const reset = await cli(['--allow-fixtures', '--reset'], { NODE_ENV: 'test' });
      expect(reset.code).toBe(0);
      expect(reset.stdout).toContain('7 matches');
      expect(await target.db.select().from(match)).toHaveLength(0);
      expect(await target.db.select().from(asset)).toHaveLength(0);
    } finally {
      await target.drop();
      await rm(media, { recursive: true, force: true });
    }
  });
});
