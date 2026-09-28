import 'server-only';
import {
  asset,
  contentDocument,
  contentRevision,
  contentTranslation,
  LOCALES,
  manualArticle,
  manualCategory,
  slugRedirect,
  type AssetVariants,
  type Executor,
  type Game,
  type Locale,
} from '@valkyria/db';
import { and, asc, desc, eq, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { buildArticle } from '@/modules/content/article';
import { isValidSlug, SLUG_PATTERN } from '@/modules/content/slug';
import type { ArticleDTO, CounterpartResolution, SitemapEntry } from '@/modules/content/types';
import { gameRouteFromDb } from '@/modules/games/registry';
import { gamePath } from '@/modules/games/routes';
import { escapeLike, foldSearchTerm } from '@/modules/prose/text';

/**
 * Published-only Field Manual queries. Articles are content documents of kind `manual`;
 * every query is bounded to one locale and one game and reads the PUBLISHED revision
 * snapshot (title, summary, body, category label, game). Drafts, unpublished
 * translations and archived documents never appear, including in search.
 */

export const MANUAL_SEARCH_MAX = 80;

export type ManualCategorySummary = { key: string; label: string; description: string; count: number };

export type ManualSummary = {
  documentId: string;
  translationId: string;
  slug: string;
  title: string;
  excerpt: string;
  category: { key: string; label: string } | null;
  cover: { assetId: string; alt: string; width: number; height: number } | null;
  updatedAt: Date;
};

export type ManualMeta = {
  sourceUrl: string | null;
  sourcePublishedOn: string | null;
  sourceLanguage: string | null;
  credits: string;
  reviewedAt: Date | null;
};

export type ManualLookup = { kind: 'article'; article: ArticleDTO; meta: ManualMeta } | { kind: 'redirect'; slug: string } | null;

const isLocale = (value: unknown): value is Locale => typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

function liveManual(locale: Locale, game: Game): SQL {
  return and(
    eq(contentDocument.kind, 'manual'),
    isNull(contentDocument.archivedAt),
    isNull(contentTranslation.archivedAt),
    eq(contentTranslation.locale, locale),
    isNotNull(contentTranslation.publishedRevisionId),
    isNotNull(contentTranslation.liveSlug),
    sql`${contentRevision.taxonomy}->>'game' = ${game}`,
  )!;
}

const publishedRevisionJoin = and(eq(contentRevision.id, contentTranslation.publishedRevisionId), eq(contentRevision.translationId, contentTranslation.id));

/** Searchable text of the published body: every rich-text `text` value, not JSON keys. */
const bodyText = sql`jsonb_path_query_array(${contentRevision.body}, 'strict $.**.text')::text`;

const FOLD_FROM = 'áäčďéěëíňóöřšťúůüýžÁÄČĎÉĚËÍŇÓÖŘŠŤÚŮÜÝŽ';
const FOLD_TO = 'aacdeeeinoorstuuuyzAACDEEEINOORSTUUUYZ';

/** Common Czech/English clan abbreviations searched together with their long forms. */
const SYNONYMS: Record<string, string[]> = {
  sl: ['squad leader', 'velitel druzstva', 'velitel jednotky'],
  tc: ['tank commander', 'velitel tanku'],
  at: ['anti-tank', 'protitank'],
  hq: ['velitelstvi', 'headquarters'],
  mg: ['machine gunner', 'kulometcik'],
};

/** Folded search terms: the query itself plus synonyms of a known abbreviation. */
export function manualSearchTerms(raw: string): string[] {
  const folded = foldSearchTerm(raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, MANUAL_SEARCH_MAX);
  if (!folded) return [];
  return [folded, ...(SYNONYMS[folded] ?? [])];
}

function searchCondition(terms: string[]): SQL {
  const columns = [contentRevision.title, contentRevision.excerpt, bodyText];
  const parts = terms.flatMap((term) => {
    const pattern = `%${escapeLike(term)}%`;
    return columns.map((column) => sql`lower(translate(coalesce(${column}, ''), ${FOLD_FROM}, ${FOLD_TO})) like ${pattern}`);
  });
  return sql`(${sql.join(parts, sql` or `)})`;
}

/** Categories of a game that have at least one published article in `locale`, in editorial order. */
export async function listManualCategories(db: Executor, input: { locale: string; game: Game }): Promise<ManualCategorySummary[]> {
  if (!isLocale(input.locale)) return [];
  const counts = await db
    .select({ key: sql<string>`${contentRevision.taxonomy}->'category'->>'key'`, count: sql<number>`count(*)::int` })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(contentRevision, publishedRevisionJoin)
    .where(liveManual(input.locale, input.game))
    .groupBy(sql`${contentRevision.taxonomy}->'category'->>'key'`);
  const byKey = new Map(counts.filter((row) => row.key).map((row) => [row.key, row.count]));
  if (byKey.size === 0) return [];
  const rows = await db.select().from(manualCategory).where(eq(manualCategory.game, input.game)).orderBy(asc(manualCategory.sortOrder), asc(manualCategory.key));
  return rows
    .filter((row) => byKey.has(row.key))
    .map((row) => ({
      key: row.key,
      label: input.locale === 'cs' ? row.labelCs : row.labelEn,
      description: input.locale === 'cs' ? row.descriptionCs : row.descriptionEn,
      count: byKey.get(row.key) ?? 0,
    }));
}

/**
 * Published articles of one game and locale, optionally in one category and/or matching
 * a diacritic-insensitive search over title, summary and body text (plus synonyms of
 * common abbreviations). Ordered by category order, article order and title.
 */
export async function listPublishedManual(
  db: Executor,
  input: { locale: string; game: Game; category?: string; q?: string; limit?: number },
): Promise<{ items: ManualSummary[]; total: number }> {
  if (!isLocale(input.locale)) return { items: [], total: 0 };
  const conditions: SQL[] = [liveManual(input.locale, input.game)];
  if (input.category !== undefined) {
    if (input.category.length > 64 || !SLUG_PATTERN.test(input.category)) return { items: [], total: 0 };
    conditions.push(sql`${contentRevision.taxonomy}->'category'->>'key' = ${input.category}`);
  }
  if (input.q !== undefined) {
    const terms = manualSearchTerms(input.q);
    if (terms.length > 0) conditions.push(searchCondition(terms));
  }
  const where = and(...conditions)!;
  const limit = Math.min(Math.max(input.limit ?? 60, 1), 100);
  const rows = await db
    .select({
      documentId: contentDocument.id,
      translationId: contentTranslation.id,
      slug: contentTranslation.liveSlug,
      publishedAt: contentTranslation.publishedAt,
      title: contentRevision.title,
      excerpt: contentRevision.excerpt,
      cover: contentRevision.cover,
      taxonomy: contentRevision.taxonomy,
      coverVariants: asset.variants,
      categoryOrder: manualCategory.sortOrder,
      articleOrder: manualArticle.sortOrder,
    })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(contentRevision, publishedRevisionJoin)
    .leftJoin(manualArticle, eq(manualArticle.documentId, contentDocument.id))
    .leftJoin(manualCategory, and(eq(manualCategory.game, input.game), sql`${manualCategory.key} = ${contentRevision.taxonomy}->'category'->>'key'`))
    .leftJoin(asset, and(sql`${asset.id} = (${contentRevision.cover}->>'assetId')::uuid`, isNull(asset.deletedAt), eq(asset.state, 'ready')))
    .where(where)
    .orderBy(sql`${manualCategory.sortOrder} asc nulls last`, sql`${manualArticle.sortOrder} asc nulls last`, asc(contentRevision.title), asc(contentTranslation.id))
    .limit(limit);
  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(contentRevision, publishedRevisionJoin)
    .where(where);
  const items = rows.map((row) => {
    const full = (row.coverVariants as AssetVariants | null)?.full;
    return {
      documentId: row.documentId,
      translationId: row.translationId,
      slug: row.slug!,
      title: row.title,
      excerpt: row.excerpt,
      category: row.taxonomy.category ?? null,
      cover: row.cover && full ? { assetId: row.cover.assetId, alt: row.cover.decorative ? '' : row.cover.alt, width: full.width, height: full.height } : null,
      updatedAt: row.publishedAt!,
    };
  });
  return { items, total: count?.total ?? 0 };
}

async function loadMeta(db: Executor, documentId: string): Promise<ManualMeta> {
  const [row] = await db.select().from(manualArticle).where(eq(manualArticle.documentId, documentId)).limit(1);
  return {
    sourceUrl: row?.sourceUrl ?? null,
    sourcePublishedOn: row?.sourcePublishedOn ?? null,
    sourceLanguage: row?.sourceLanguage ?? null,
    credits: row?.credits ?? '',
    reviewedAt: row?.reviewedAt ?? null,
  };
}

/**
 * Published article by locale + game + live slug, a same-locale redirect for a previous
 * published slug, or `null` (unknown, draft-only, unpublished, archived or another game).
 */
export async function getPublishedManualBySlug(db: Executor, input: { locale: string; game: Game; slug: string }): Promise<ManualLookup> {
  if (!isLocale(input.locale) || !isValidSlug(input.slug)) return null;
  const [row] = await db
    .select({ document: contentDocument, translation: contentTranslation, revision: contentRevision })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(contentRevision, publishedRevisionJoin)
    .where(and(liveManual(input.locale, input.game), eq(contentTranslation.namespace, 'manual'), eq(contentTranslation.liveSlug, input.slug)));
  if (row) {
    const [article, meta] = await Promise.all([buildArticle(db, { ...row, isPreview: false }), loadMeta(db, row.document.id)]);
    return { kind: 'article', article, meta };
  }
  const [redirect] = await db
    .select({ liveSlug: contentTranslation.liveSlug })
    .from(slugRedirect)
    .innerJoin(contentTranslation, eq(contentTranslation.id, slugRedirect.translationId))
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(contentRevision, publishedRevisionJoin)
    .where(
      and(
        eq(slugRedirect.namespace, 'manual'),
        eq(slugRedirect.locale, input.locale),
        eq(slugRedirect.sourceSlug, input.slug),
        liveManual(input.locale, input.game),
        ne(contentTranslation.liveSlug, input.slug),
      ),
    );
  return redirect?.liveSlug ? { kind: 'redirect', slug: redirect.liveSlug } : null;
}

/** Published counterpart of a published manual article (locale switch), by entity identity. */
export async function resolveManualCounterpart(db: Executor, input: { game: Game; fromLocale: string; slug: string; toLocale: string }): Promise<CounterpartResolution> {
  if (!isLocale(input.fromLocale) || !isLocale(input.toLocale)) return null;
  const source = await getPublishedManualBySlug(db, { locale: input.fromLocale, game: input.game, slug: input.slug });
  if (!source) return null;
  if (source.kind === 'redirect') return resolveManualCounterpart(db, { ...input, slug: source.slug });
  const target = source.article.counterparts[input.toLocale];
  return target ? { kind: 'published', slug: target } : { kind: 'missing', sourceSlug: source.article.slug };
}

/** Every published manual URL with published-only hreflang alternates. */
export async function listPublishedManualForSitemap(db: Executor): Promise<SitemapEntry[]> {
  const rows = await db
    .select({
      documentId: contentDocument.id,
      locale: contentTranslation.locale,
      liveSlug: contentTranslation.liveSlug,
      publishedAt: contentTranslation.publishedAt,
      game: sql<Game>`${contentRevision.taxonomy}->>'game'`,
    })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(contentRevision, publishedRevisionJoin)
    .where(
      and(
        eq(contentDocument.kind, 'manual'),
        isNull(contentDocument.archivedAt),
        isNull(contentTranslation.archivedAt),
        isNotNull(contentTranslation.publishedRevisionId),
        isNotNull(contentTranslation.liveSlug),
        or(sql`${contentRevision.taxonomy}->>'game' = 'hell-let-loose'`, sql`${contentRevision.taxonomy}->>'game' = 'wardogs'`),
      ),
    )
    .orderBy(desc(contentTranslation.publishedAt))
    .limit(5000);
  const pathOf = (row: (typeof rows)[number]) => `/${row.locale}${gamePath(gameRouteFromDb(row.game), 'field-manual', row.liveSlug!)}`;
  const alternates = new Map<string, Partial<Record<Locale, string>>>();
  for (const row of rows) {
    const map = alternates.get(row.documentId) ?? {};
    map[row.locale] = pathOf(row);
    alternates.set(row.documentId, map);
  }
  return rows.map((row) => ({ locale: row.locale, path: pathOf(row), lastModified: row.publishedAt!, alternates: alternates.get(row.documentId) ?? {} }));
}
