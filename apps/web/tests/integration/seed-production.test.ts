import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  auditEvent,
  authUser,
  contentDocument,
  contentRevision,
  contentTranslation,
  localAdminGrant,
  LOCALES,
  match,
  memberProfile,
  PAGE_KEYS,
  taxonomyTerm,
} from '@valkyria/db';
import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPublishedPage } from '@/modules/content/public';
import { parseRichTextDocument, RICH_TEXT_SCHEMA_VERSION } from '@/modules/content/rich-text/schema';
import { runSeed } from '@/seed/index';
import { SEED_DRAFT_ONLY_PAGES, SEED_PAGES } from '@/seed/pages';
import { SEED_RICH_TEXT_SCHEMA_VERSION } from '@/seed/rich-text';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

const run = promisify(execFile);
const appRoot = path.resolve(import.meta.dirname, '../..');
const tsxCli = path.join(appRoot, 'node_modules/tsx/dist/cli.mjs');

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function counts() {
  const tables = { contentDocument, contentTranslation, contentRevision, taxonomyTerm, auditEvent, match, memberProfile, authUser, localAdminGrant };
  const result: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await t.db.select({ n: count() }).from(table);
    result[name] = row!.n;
  }
  return result;
}

function collectLinks(node: unknown, out: { href: string; text: string }[] = []) {
  if (!node || typeof node !== 'object') return out;
  const value = node as { type?: string; text?: string; marks?: { type: string; attrs?: { href?: string } }[]; content?: unknown[] };
  for (const mark of value.marks ?? []) if (mark.type === 'link' && mark.attrs?.href) out.push({ href: mark.attrs.href, text: value.text ?? '' });
  for (const child of value.content ?? []) collectLinks(child, out);
  return out;
}

describe('production seed', () => {
  it('uses the current rich-text schema version and valid bodies', () => {
    expect(SEED_RICH_TEXT_SCHEMA_VERSION).toBe(RICH_TEXT_SCHEMA_VERSION);
    for (const pageKey of PAGE_KEYS) {
      for (const locale of LOCALES) {
        const result = parseRichTextDocument(SEED_PAGES[pageKey][locale].body);
        expect(result.ok ? [] : result.issues, `${pageKey}/${locale}`).toEqual([]);
      }
    }
  });

  it('publishes both locales of every reviewed core page with live slug equal to the page key', async () => {
    const report = await runSeed(t.db);
    expect(report.inserted).toEqual(
      expect.arrayContaining(['page clan (cs)', 'page clan (en)', 'page privacy (en)', 'page faq (cs) draft', 'page faq (en) draft', 'taxonomy category announcement', 'manual category hell-let-loose/roles']),
    );
    for (const pageKey of PAGE_KEYS) {
      const [document] = await t.db.select().from(contentDocument).where(eq(contentDocument.pageKey, pageKey));
      expect(document).toMatchObject({ kind: 'page', isFixture: false });
      const translations = await t.db.select().from(contentTranslation).where(eq(contentTranslation.documentId, document!.id));
      expect(translations.map((row) => row.locale).sort()).toEqual(['cs', 'en']);
      for (const translation of translations) {
        const draftOnly = SEED_DRAFT_ONLY_PAGES.has(pageKey);
        expect(translation).toMatchObject({ namespace: 'page', liveSlug: draftOnly ? null : pageKey, draftSlug: pageKey });
        expect(translation.publishedRevisionId).toBe(draftOnly ? null : translation.draftRevisionId);
        const [revision] = await t.db.select().from(contentRevision).where(eq(contentRevision.id, translation.draftRevisionId!));
        expect(revision).toMatchObject({ kind: 'seed', locale: translation.locale, slug: pageKey, schemaVersion: RICH_TEXT_SCHEMA_VERSION });
        expect(parseRichTextDocument(revision!.body).ok).toBe(true);
        expect(revision!.title.length).toBeGreaterThan(0);
      }
    }
    const categories = await t.db.select().from(taxonomyTerm);
    expect(categories.map((row) => [row.kind, row.key, row.labelCs, row.labelEn])).toEqual(
      expect.arrayContaining([
        ['category', 'announcement', 'Oznámení', 'Announcement'],
        ['category', 'match-report', 'Zápasy', 'Match report'],
        ['category', 'community', 'Komunita', 'Community'],
        ['category', 'update', 'Novinky webu', 'Site update'],
      ]),
    );
    expect(categories.filter((row) => row.kind === 'tag')).toHaveLength(0);
  });

  it('seeds the FAQ only as an unpublished outline of the legacy questions', async () => {
    const [document] = await t.db.select().from(contentDocument).where(eq(contentDocument.pageKey, 'faq'));
    for (const locale of LOCALES) {
      expect(await getPublishedPage(locale, 'faq', t.db)).toBeNull();
      const [translation] = await t.db
        .select()
        .from(contentTranslation)
        .where(and(eq(contentTranslation.documentId, document!.id), eq(contentTranslation.locale, locale)));
      const [draft] = await t.db.select().from(contentRevision).where(eq(contentRevision.id, translation!.draftRevisionId!));
      const blocks = (draft!.body.content ?? []) as { type: string }[];
      expect(blocks.filter((block) => block.type === 'heading')).toHaveLength(11);
      expect(JSON.stringify(draft!.body)).toContain(locale === 'cs' ? 'Odpověď připravujeme.' : 'We are preparing this answer.');
    }
    // The published core pages are unaffected.
    expect((await getPublishedPage('cs', 'clan', t.db))?.title).toBe('Klan Valkyria');
  });

  it('is idempotent and never overwrites administrator edits', async () => {
    const [clan] = await t.db.select().from(contentDocument).where(eq(contentDocument.pageKey, 'clan'));
    const [cs] = await t.db
      .select()
      .from(contentTranslation)
      .where(and(eq(contentTranslation.documentId, clan!.id), eq(contentTranslation.locale, 'cs')));
    const [edited] = await t.db
      .insert(contentRevision)
      .values({
        translationId: cs!.id,
        locale: 'cs',
        kind: 'save',
        schemaVersion: 1,
        title: 'Upraveno administrátorem',
        slug: 'clan',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Admin text' }] }] },
        taxonomy: { category: null, tags: [] },
      })
      .returning();
    await t.db.update(contentTranslation).set({ draftRevisionId: edited!.id, publishedRevisionId: edited!.id }).where(eq(contentTranslation.id, cs!.id));

    const before = await counts();
    const report = await runSeed(t.db);
    expect(report.inserted).toEqual([]);
    expect(report.skipped).toHaveLength(4 + 6 + PAGE_KEYS.length * LOCALES.length); // news categories + HLL manual categories + pages
    expect(await counts()).toEqual(before);
    const [after] = await t.db.select().from(contentTranslation).where(eq(contentTranslation.id, cs!.id));
    expect(after?.publishedRevisionId).toBe(edited!.id);
  });

  it('creates no accounts, grants, members, matches or fixtures', async () => {
    const totals = await counts();
    expect(totals).toMatchObject({ authUser: 0, localAdminGrant: 0, memberProfile: 0, match: 0 });
    const fixtures = await t.db.select().from(contentDocument).where(eq(contentDocument.isFixture, true));
    expect(fixtures).toHaveLength(0);
  });

  it('uses only reviewed facts and links, including the HLL website link on clan and community pages', () => {
    const allowed = new Set(['https://valkyriahll.cz/', 'https://valkyriahll.cz/matches', 'https://discord.gg/vlkhll']);
    const forbidden = [/3\s?500/, /\b100\s?\+/, /\b150\s?\+/, /ECL/, /Vietnam/i, /youtube|instagram|facebook|steam/i, /moneta/i, /eef9c6d0/];
    for (const pageKey of PAGE_KEYS) {
      for (const locale of LOCALES) {
        const copy = SEED_PAGES[pageKey][locale];
        const json = JSON.stringify(copy);
        for (const pattern of forbidden) expect(json, `${pageKey}/${locale} ${pattern}`).not.toMatch(pattern);
        for (const link of collectLinks(copy.body)) expect(allowed.has(link.href), link.href).toBe(true);
      }
    }
    for (const pageKey of ['clan', 'community'] as const) {
      expect(collectLinks(SEED_PAGES[pageKey].cs.body)).toContainEqual({ href: 'https://valkyriahll.cz/', text: 'Web Hell Let Loose' });
      expect(collectLinks(SEED_PAGES[pageKey].en.body)).toContainEqual({ href: 'https://valkyriahll.cz/', text: 'Hell Let Loose website' });
    }
    expect(JSON.stringify(SEED_PAGES.clan.cs)).toContain('2022');
    expect(JSON.stringify(SEED_PAGES.clan.cs)).toContain('17. září 2026');
    expect(JSON.stringify(SEED_PAGES.clan.en)).toContain('17 September 2026');
    expect(JSON.stringify(SEED_PAGES.privacy.cs)).toContain('čekají na potvrzení');
    expect(JSON.stringify(SEED_PAGES.privacy.en)).toContain('pending confirmation');
    expect(JSON.stringify(SEED_PAGES.privacy.en)).toContain('identify');
  });
});

describe('seed CLI', () => {
  it('prints inserted/skipped items, changes nothing on a second run and fails with a non-zero exit', async () => {
    const target = await createTestDatabase();
    try {
      const env = { ...process.env, DATABASE_URL: target.url };
      const first = await run(process.execPath, [tsxCli, 'src/cli/seed.ts'], { cwd: appRoot, env });
      expect(first.stdout).toContain('inserted: page clan (cs)');
      expect(first.stdout).toContain('Seed complete: 22 inserted, 0 skipped.');
      const second = await run(process.execPath, [tsxCli, 'src/cli/seed.ts'], { cwd: appRoot, env });
      expect(second.stdout).toContain('Seed complete: 0 inserted, 18 skipped.');

      const broken = await run(process.execPath, [tsxCli, 'src/cli/seed.ts'], {
        cwd: appRoot,
        env: { ...process.env, DATABASE_URL: 'postgresql://nobody:secret-value@127.0.0.1:1/none' },
      }).then(
        () => null,
        (error: { code?: number; stderr?: string }) => error,
      );
      expect(broken?.code).toBe(1);
      expect(broken?.stderr).toContain('Seed failed');
      expect(broken?.stderr).not.toContain('secret-value');
    } finally {
      await target.drop();
    }
  });
});
