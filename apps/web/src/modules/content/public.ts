import 'server-only';
import {
  GAMES,
  LOCALES,
  PAGE_KEYS,
  asset,
  contentDocument,
  contentRevision,
  contentTranslation,
  slugRedirect,
  taxonomyTerm,
  type AssetVariants,
  type Executor,
  type Game,
  type Locale,
  type PageKey,
} from '@valkyria/db';
import { and, desc, eq, ilike, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { buildArticle } from './article';
import { isValidSlug, SLUG_PATTERN } from './slug';
import type { AvailableTaxonomy, ArticleDTO, CounterpartResolution, NewsLookup, NewsSummary, Paginated, SitemapEntry, TaxonomyLabel } from './types';

/**
 * Public, published-only queries. Every query includes the locale and reads title,
 * slug, excerpt, cover, author label, SEO and taxonomy labels from the translation's
 * PUBLISHED revision snapshot. Drafts, future schedules, unpublished translations and
 * archived documents never appear. All functions accept an optional executor (tests).
 */

export const PUBLIC_PAGE_SIZE_MAX = 24;

const isLocale = (value: unknown): value is Locale => typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

const listSchema = z.object({
  locale: z.enum(LOCALES),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PUBLIC_PAGE_SIZE_MAX).catch(12).default(12),
  category: z.string().optional(),
  tag: z.string().optional(),
  game: z.string().optional(),
  /** Game section view: that game's posts plus explicit community posts (no game). */
  gameScope: z.string().optional(),
  q: z.string().optional(),
});
export type ListPublishedNewsInput = z.input<typeof listSchema>;

/** Base condition: a live news/page translation of a non-archived document in `locale`. */
function liveCondition(locale: Locale, kind: 'news' | 'page'): SQL {
  return and(
    eq(contentDocument.kind, kind),
    isNull(contentDocument.archivedAt),
    isNull(contentTranslation.archivedAt),
    eq(contentTranslation.locale, locale),
    isNotNull(contentTranslation.publishedRevisionId),
    isNotNull(contentTranslation.liveSlug),
  )!;
}

const summaryColumns = {
  documentId: contentDocument.id,
  translationId: contentTranslation.id,
  locale: contentTranslation.locale,
  slug: contentTranslation.liveSlug,
  publishedAt: contentTranslation.publishedAt,
  firstPublishedAt: contentTranslation.firstPublishedAt,
  title: contentRevision.title,
  excerpt: contentRevision.excerpt,
  cover: contentRevision.cover,
  authorLabel: contentRevision.authorLabel,
  taxonomy: contentRevision.taxonomy,
  coverVariants: asset.variants,
};

function publishedNewsQuery(db: Executor, where: SQL) {
  return db
    .select(summaryColumns)
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(
      contentRevision,
      and(eq(contentRevision.id, contentTranslation.publishedRevisionId), eq(contentRevision.translationId, contentTranslation.id)),
    )
    .leftJoin(
      asset,
      and(sql`${asset.id} = (${contentRevision.cover}->>'assetId')::uuid`, isNull(asset.deletedAt), eq(asset.state, 'ready')),
    )
    .where(where);
}

type SummaryRow = Awaited<ReturnType<typeof publishedNewsQuery>>[number];

function toSummary(row: SummaryRow): NewsSummary {
  const full = (row.coverVariants as AssetVariants | null)?.full;
  const cover = row.cover && full ? { assetId: row.cover.assetId, alt: row.cover.decorative ? '' : row.cover.alt, width: full.width, height: full.height } : null;
  const taxonomy = row.taxonomy ?? { category: null, tags: [] };
  const updatedAt = row.publishedAt!;
  return {
    documentId: row.documentId,
    translationId: row.translationId,
    locale: row.locale,
    slug: row.slug!,
    title: row.title,
    excerpt: row.excerpt,
    cover,
    publishedAt: row.firstPublishedAt ?? updatedAt,
    updatedAt,
    authorLabel: row.authorLabel,
    category: taxonomy.category ?? null,
    tags: taxonomy.tags ?? [],
    game: taxonomy.game ?? null,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Published-snapshot game scope of a game section: the game's own posts plus community
 * posts without a game. Unknown values fail closed (`null` → empty result), never "all".
 */
function gameScopeCondition(game: unknown): SQL | null {
  if (typeof game !== 'string' || !(GAMES as readonly string[]).includes(game)) return null;
  return sql`(${contentRevision.taxonomy}->>'game' = ${game} or ${contentRevision.taxonomy}->>'game' is null)`;
}

const orderNewest = [desc(sql`coalesce(${contentTranslation.firstPublishedAt}, ${contentTranslation.publishedAt})`), desc(contentTranslation.id)];

/** Published news of one locale with category/tag/game/search filters and pagination. */
export async function listPublishedNews(rawInput: ListPublishedNewsInput, db: Executor = getDb()): Promise<Paginated<NewsSummary>> {
  const parsed = listSchema.safeParse(rawInput);
  if (!parsed.success) return { items: [], total: 0, page: 1, pageCount: 0, pageSize: 12 };
  const input = parsed.data;
  const empty = { items: [], total: 0, page: input.page, pageCount: 0, pageSize: input.pageSize };
  const conditions: SQL[] = [liveCondition(input.locale, 'news')];
  if (input.category) {
    if (!SLUG_PATTERN.test(input.category) || input.category.length > 64) return empty;
    conditions.push(sql`${contentRevision.taxonomy}->'category'->>'key' = ${input.category}`);
  }
  if (input.tag) {
    if (!SLUG_PATTERN.test(input.tag) || input.tag.length > 64) return empty;
    conditions.push(sql`${contentRevision.taxonomy}->'tags' @> ${JSON.stringify([{ key: input.tag }])}::jsonb`);
  }
  if (input.game) {
    if (!(GAMES as readonly string[]).includes(input.game)) return empty;
    conditions.push(sql`${contentRevision.taxonomy}->>'game' = ${input.game}`);
  }
  if (input.gameScope !== undefined) {
    const scope = gameScopeCondition(input.gameScope);
    if (!scope) return empty;
    conditions.push(scope);
  }
  const q = input.q?.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(or(ilike(contentRevision.title, pattern), ilike(contentRevision.excerpt, pattern))!);
  }
  const where = and(...conditions)!;
  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(
      contentRevision,
      and(eq(contentRevision.id, contentTranslation.publishedRevisionId), eq(contentRevision.translationId, contentTranslation.id)),
    )
    .where(where);
  const total = count?.total ?? 0;
  const rows = await publishedNewsQuery(db, where)
    .orderBy(...orderNewest)
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return { items: rows.map(toSummary), total, page: input.page, pageSize: input.pageSize, pageCount: Math.ceil(total / input.pageSize) };
}

async function loadLiveNews(db: Executor, locale: Locale, slug: string) {
  const [row] = await db
    .select({ document: contentDocument, translation: contentTranslation, revision: contentRevision })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(
      contentRevision,
      and(eq(contentRevision.id, contentTranslation.publishedRevisionId), eq(contentRevision.translationId, contentTranslation.id)),
    )
    .where(and(liveCondition(locale, 'news'), eq(contentTranslation.namespace, 'news'), eq(contentTranslation.liveSlug, slug)));
  return row ?? null;
}

/** Live translation reached through a same-locale redirect source (previous published slug). */
async function loadRedirectTarget(db: Executor, locale: Locale, slug: string) {
  const [row] = await db
    .select({ documentId: contentDocument.id, translationId: contentTranslation.id, liveSlug: contentTranslation.liveSlug })
    .from(slugRedirect)
    .innerJoin(contentTranslation, eq(contentTranslation.id, slugRedirect.translationId))
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .where(
      and(
        eq(slugRedirect.namespace, 'news'),
        eq(slugRedirect.locale, locale),
        eq(slugRedirect.sourceSlug, slug),
        liveCondition(locale, 'news'),
        ne(contentTranslation.liveSlug, slug),
      ),
    );
  return row ?? null;
}

/**
 * Published article by locale + live slug, a redirect to the current live slug for a
 * previous published slug, or `null` (unknown, draft-only, unpublished, archived).
 */
export async function getPublishedNewsBySlug(locale: string, slug: string, db: Executor = getDb()): Promise<NewsLookup> {
  if (!isLocale(locale) || !isValidSlug(slug)) return null;
  const live = await loadLiveNews(db, locale, slug);
  if (live) return { kind: 'article', article: await buildArticle(db, { ...live, isPreview: false }) };
  const redirect = await loadRedirectTarget(db, locale, slug);
  if (redirect?.liveSlug) return { kind: 'redirect', slug: redirect.liveSlug };
  return null;
}

/** Published core page (`clan`, `community`, `privacy`) for a locale, or `null`. */
export async function getPublishedPage(locale: string, pageKey: string, db: Executor = getDb()): Promise<ArticleDTO | null> {
  if (!isLocale(locale) || !(PAGE_KEYS as readonly string[]).includes(pageKey)) return null;
  const [row] = await db
    .select({ document: contentDocument, translation: contentTranslation, revision: contentRevision })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(
      contentRevision,
      and(eq(contentRevision.id, contentTranslation.publishedRevisionId), eq(contentRevision.translationId, contentTranslation.id)),
    )
    .where(and(liveCondition(locale, 'page'), eq(contentDocument.pageKey, pageKey as PageKey)));
  if (!row) return null;
  return buildArticle(db, { ...row, isPreview: false });
}

/**
 * Finds the published counterpart of a published article by entity identity (never by
 * rewriting the URL). `missing` carries the source slug for the localized notice link.
 */
export async function resolveNewsCounterpart(
  fromLocale: string,
  slug: string,
  toLocale: string,
  db: Executor = getDb(),
): Promise<CounterpartResolution> {
  if (!isLocale(fromLocale) || !isLocale(toLocale) || !isValidSlug(slug)) return null;
  const live = await loadLiveNews(db, fromLocale, slug);
  let documentId = live?.document.id;
  let sourceSlug = live?.translation.liveSlug ?? null;
  if (!live) {
    const redirect = await loadRedirectTarget(db, fromLocale, slug);
    if (!redirect) return null;
    documentId = redirect.documentId;
    sourceSlug = redirect.liveSlug;
  }
  if (!documentId || !sourceSlug) return null;
  if (fromLocale === toLocale) return { kind: 'published', slug: sourceSlug };
  const [target] = await db
    .select({ liveSlug: contentTranslation.liveSlug })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .where(and(eq(contentTranslation.documentId, documentId), liveCondition(toLocale, 'news')));
  if (target?.liveSlug) return { kind: 'published', slug: target.liveSlug };
  return { kind: 'missing', sourceSlug };
}

/** Related published posts of the same locale, ranked by shared category/tags/game. */
export async function getRelatedNews(
  input: { locale: string; documentId: string; limit?: number; gameScope?: Game },
  db: Executor = getDb(),
): Promise<NewsSummary[]> {
  if (!isLocale(input.locale) || !z.uuid().safeParse(input.documentId).success) return [];
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 6);
  const [current] = await db
    .select({ taxonomy: contentRevision.taxonomy })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(
      contentRevision,
      and(eq(contentRevision.id, contentTranslation.publishedRevisionId), eq(contentRevision.translationId, contentTranslation.id)),
    )
    .where(and(liveCondition(input.locale, 'news'), eq(contentDocument.id, input.documentId)));
  if (!current) return [];
  const taxonomy = current.taxonomy;
  const scope = input.gameScope !== undefined ? gameScopeCondition(input.gameScope) : undefined;
  if (scope === null) return [];
  const candidates = await publishedNewsQuery(db, and(liveCondition(input.locale, 'news'), ne(contentDocument.id, input.documentId), scope)!)
    .orderBy(...orderNewest)
    .limit(50);
  const tagKeys = new Set((taxonomy.tags ?? []).map((tag) => tag.key));
  const scored = candidates
    .map((row, index) => {
      const t = row.taxonomy ?? { category: null, tags: [] };
      let score = 0;
      if (taxonomy.category && t.category?.key === taxonomy.category.key) score += 3;
      score += (t.tags ?? []).filter((tag) => tagKeys.has(tag.key)).length * 2;
      if (taxonomy.game && t.game === taxonomy.game) score += 1;
      return { row, score, index };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((entry) => toSummary(entry.row));
}

/** Newest published post of a locale for the small homepage teaser, or `null`. */
export async function getLatestNewsTeaser(locale: string, db: Executor = getDb(), gameScope?: Game): Promise<NewsSummary | null> {
  if (!isLocale(locale)) return null;
  const scope = gameScope !== undefined ? gameScopeCondition(gameScope) : undefined;
  if (scope === null) return null;
  const [row] = await publishedNewsQuery(db, and(liveCondition(locale, 'news'), scope)!).orderBy(...orderNewest).limit(1);
  return row ? toSummary(row) : null;
}

async function sitemapRows(db: Executor, kind: 'news' | 'page') {
  return db
    .select({
      documentId: contentDocument.id,
      pageKey: contentDocument.pageKey,
      locale: contentTranslation.locale,
      liveSlug: contentTranslation.liveSlug,
      publishedAt: contentTranslation.publishedAt,
    })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .where(
      and(
        eq(contentDocument.kind, kind),
        isNull(contentDocument.archivedAt),
        isNull(contentTranslation.archivedAt),
        isNotNull(contentTranslation.publishedRevisionId),
        isNotNull(contentTranslation.liveSlug),
      ),
    )
    .orderBy(desc(contentTranslation.publishedAt))
    .limit(20_000);
}

function toSitemap(rows: Awaited<ReturnType<typeof sitemapRows>>, pathOf: (row: (typeof rows)[number]) => string): SitemapEntry[] {
  const alternates = new Map<string, Partial<Record<Locale, string>>>();
  for (const row of rows) {
    const map = alternates.get(row.documentId) ?? {};
    map[row.locale] = pathOf(row);
    alternates.set(row.documentId, map);
  }
  return rows.map((row) => ({
    locale: row.locale,
    path: pathOf(row),
    lastModified: row.publishedAt!,
    alternates: alternates.get(row.documentId) ?? {},
  }));
}

/** Every published news URL (both locales) with published-only hreflang alternates. */
export async function listPublishedNewsForSitemap(db: Executor = getDb()): Promise<SitemapEntry[]> {
  return toSitemap(await sitemapRows(db, 'news'), (row) => `/${row.locale}/news/${row.liveSlug}`);
}

/** Published core pages (both locales) with published-only alternates. */
export async function listPublishedPagesForSitemap(db: Executor = getDb()): Promise<SitemapEntry[]> {
  return toSitemap(await sitemapRows(db, 'page'), (row) => `/${row.locale}/${row.pageKey}`);
}

/** Categories, tags and games that have published posts in `locale` (for filters). */
export async function getAvailableTaxonomy(locale: string, db: Executor = getDb(), gameScope?: Game): Promise<AvailableTaxonomy> {
  if (!isLocale(locale)) return { categories: [], tags: [], games: [] };
  const scope = gameScope !== undefined ? gameScopeCondition(gameScope) : undefined;
  if (scope === null) return { categories: [], tags: [], games: [] };
  const rows = await db
    .select({ taxonomy: contentRevision.taxonomy })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(
      contentRevision,
      and(eq(contentRevision.id, contentTranslation.publishedRevisionId), eq(contentRevision.translationId, contentTranslation.id)),
    )
    .where(and(liveCondition(locale, 'news'), scope))
    .orderBy(desc(contentTranslation.publishedAt))
    .limit(5000);
  const categories = new Map<string, { label: string; count: number }>();
  const tags = new Map<string, { label: string; count: number }>();
  const games = new Map<Game, number>();
  const add = (map: Map<string, { label: string; count: number }>, term: TaxonomyLabel) => {
    const entry = map.get(term.key);
    if (entry) entry.count += 1;
    else map.set(term.key, { label: term.label, count: 1 });
  };
  for (const { taxonomy } of rows) {
    if (taxonomy.category) add(categories, taxonomy.category);
    for (const tag of taxonomy.tags ?? []) add(tags, tag);
    if (taxonomy.game) games.set(taxonomy.game, (games.get(taxonomy.game) ?? 0) + 1);
  }
  // Filter labels use the current approved term labels (falling back to the newest snapshot label).
  const keys = [...categories.keys(), ...tags.keys()];
  const terms = keys.length > 0 ? await db.select().from(taxonomyTerm).where(or(...keys.map((key) => eq(taxonomyTerm.key, key)))) : [];
  const labelOf = (kind: 'category' | 'tag', key: string, fallback: string) => {
    const term = terms.find((row) => row.kind === kind && row.key === key);
    return term ? (locale === 'cs' ? term.labelCs : term.labelEn) : fallback;
  };
  const collator = new Intl.Collator(locale === 'cs' ? 'cs-CZ' : 'en-GB');
  const facets = (kind: 'category' | 'tag', map: Map<string, { label: string; count: number }>) =>
    [...map.entries()]
      .map(([key, value]) => ({ key, label: labelOf(kind, key, value.label), count: value.count }))
      .sort((a, b) => collator.compare(a.label, b.label));
  return {
    categories: facets('category', categories),
    tags: facets('tag', tags),
    games: [...games.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key)),
  };
}
