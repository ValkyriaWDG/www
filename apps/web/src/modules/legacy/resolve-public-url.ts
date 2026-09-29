import 'server-only';
import { contentDocument, contentRevision, contentTranslation, legacyImport, match, tournament, type Executor } from '@valkyria/db';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { isValidSlug } from '@/modules/content/slug';
import { gameHasSection, gameRouteFromDb, parseDbGame } from '@/modules/games/registry';
import { canonicalMatchPath, canonicalNewsPath, canonicalTournamentPath, gamePath } from '@/modules/games/routes';
import { LEGACY_HLL_ORIGIN, resolveLegacyHllPath } from './hll';

/**
 * Old source identities resolve through stable ledger FKs, never a guessed target slug.
 * Only the requested locale's current published revision is read. A missing locale,
 * draft, archive or unknown legacy identity is indistinguishable from a missing page.
 */
export async function resolvePublishedLegacyHllUrl(db: Executor, pathname: string, locale: string = 'cs'): Promise<string | null> {
  if (locale !== 'cs' && locale !== 'en') return null;
  const source = resolveLegacyHllPath(pathname);
  if (source?.kind !== 'lookup') return null;
  const [identity] = await db.select({ translationId: legacyImport.translationId, matchId: legacyImport.matchId, tournamentId: legacyImport.tournamentId })
    .from(legacyImport).where(and(
      eq(legacyImport.sourceOrigin, LEGACY_HLL_ORIGIN), eq(legacyImport.sourceKind, source.sourceKind),
      eq(legacyImport.sourceKey, source.sourceKey), eq(legacyImport.locale, 'cs'),
    )).limit(1);
  if (!identity) return null;

  if (source.sourceKind === 'match' && identity.matchId) {
    const [row] = await db.select({ slug: match.slug, game: match.game }).from(match)
      .where(and(eq(match.id, identity.matchId), eq(match.publication, 'published'), isNotNull(match.publishedAt))).limit(1);
    return row && isValidSlug(row.slug) ? `/${locale}${canonicalMatchPath(row.game, row.slug)}` : null;
  }
  if (source.sourceKind === 'tournament' && identity.tournamentId) {
    const [row] = await db.select({ slug: tournament.slug, game: tournament.game }).from(tournament)
      .where(and(eq(tournament.id, identity.tournamentId), eq(tournament.publication, 'published'), isNotNull(tournament.publishedAt))).limit(1);
    return row && isValidSlug(row.slug) && gameHasSection(gameRouteFromDb(row.game), 'tournaments') ? `/${locale}${canonicalTournamentPath(row.game, row.slug)}` : null;
  }
  if (!identity.translationId || (source.sourceKind !== 'news' && source.sourceKind !== 'manual' && source.sourceKind !== 'page')) return null;
  const [imported] = await db.select({ documentId: contentTranslation.documentId }).from(contentTranslation)
    .where(eq(contentTranslation.id, identity.translationId)).limit(1);
  if (!imported) return null;
  const [published] = await db.select({ slug: contentTranslation.liveSlug, pageKey: contentDocument.pageKey, taxonomy: contentRevision.taxonomy })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(contentRevision, and(eq(contentRevision.id, contentTranslation.publishedRevisionId), eq(contentRevision.translationId, contentTranslation.id)))
    .where(and(
      eq(contentTranslation.documentId, imported.documentId), eq(contentTranslation.locale, locale),
      eq(contentDocument.kind, source.sourceKind), eq(contentTranslation.namespace, source.sourceKind),
      isNull(contentDocument.archivedAt), isNull(contentTranslation.archivedAt),
      isNotNull(contentTranslation.publishedRevisionId), isNotNull(contentTranslation.liveSlug), isNotNull(contentTranslation.publishedAt),
    )).limit(1);
  if (!published || !isValidSlug(published.slug)) return null;
  // Game scope is revision-local: a pending draft must not move a live article's URL.
  const rawGame = published.taxonomy?.game ?? null;
  const game = parseDbGame(rawGame);
  if (rawGame !== null && game === null) return null;
  if (source.sourceKind === 'news') return `/${locale}${canonicalNewsPath(game, published.slug)}`;
  if (source.sourceKind === 'manual') return game && gameHasSection(gameRouteFromDb(game), 'field-manual') ? `/${locale}${gamePath(gameRouteFromDb(game), 'field-manual', published.slug)}` : null;
  const expectedPage = source.sourceKey === 'about' ? 'clan' : source.sourceKey === 'faq' ? 'faq' : null;
  return expectedPage && published.pageKey === expectedPage ? `/${locale}/${expectedPage}` : null;
}
