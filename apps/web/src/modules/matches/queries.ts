import 'server-only';
import {
  GAMES,
  LOCALES,
  match,
  matchResult,
  matchRound,
  tournament,
  type CompetitionType,
  type Executor,
  type Game,
  type Locale,
  type MatchOutcome,
  type MatchStatus,
  type ResultVerification,
} from '@valkyria/db';
import { and, asc, count, desc, eq, gte, inArray, lte, or, type SQL } from 'drizzle-orm';
import { capabilityScope } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { loadAssetDefaults, loadPublicImages } from '@/modules/prose/assets';
import { authorize, authorizeGames, foldedContains, pageCount, parseInput } from '@/modules/prose/domain';
import { loadProseAdminDetail, loadProseStatuses, publishedProseFor } from '@/modules/prose/queries';
import { SLUG_PATTERN } from '@/modules/prose/slug';
import { adminMatchListSchema, publicMatchListSchema, type AdminMatchListInput, type PublicMatchListInput } from './schemas';
import { loadMatchStatistics } from './statistics-service';
import type {
  AdminMatch,
  AdminMatchListItem,
  AdminMatchPage,
  AdminMatchResult,
  MatchListView,
  PublicMatchCounts,
  PublicMatchDetail,
  PublicMatchPage,
  PublicMatchResult,
  PublicMatchRound,
  PublicMatchSummary,
} from './types';

/** Status classification of the public lists (independent of publication). */
export const VIEW_STATUSES: Record<MatchListView, readonly MatchStatus[]> = {
  upcoming: ['scheduled', 'live', 'postponed'],
  results: ['completed', 'cancelled'],
};

/** A scheduled fixture still counts as "next" this long after its start time. */
export const NEXT_MATCH_GRACE_MS = 3 * 60 * 60 * 1000;

const isPublished = eq(match.publication, 'published');

/** Explicit public column list: internal notes, creator and fixture flags are never selected. */
const summaryColumns = {
  id: match.id,
  slug: match.slug,
  game: match.game,
  opponentName: match.opponentName,
  opponentShortCode: match.opponentShortCode,
  opponentLogoAssetId: match.opponentLogoAssetId,
  competitionType: match.competitionType,
  competitionName: match.competitionName,
  startsAt: match.startsAt,
  timeZone: match.timeZone,
  originalStartsAt: match.originalStartsAt,
  status: match.status,
  resultScoreValkyria: matchResult.scoreValkyria,
  resultScoreOpponent: matchResult.scoreOpponent,
  resultOutcome: matchResult.outcome,
  resultVerification: matchResult.verification,
};

type SummaryRow = {
  id: string;
  slug: string;
  game: Game;
  opponentName: string;
  opponentShortCode: string | null;
  opponentLogoAssetId: string | null;
  competitionType: CompetitionType;
  competitionName: string | null;
  startsAt: Date;
  timeZone: string;
  originalStartsAt: Date | null;
  status: MatchStatus;
  resultScoreValkyria: number | null;
  resultScoreOpponent: number | null;
  resultOutcome: MatchOutcome | null;
  resultVerification: ResultVerification | null;
};

function publicResult(row: Pick<SummaryRow, 'status' | 'resultOutcome' | 'resultScoreValkyria' | 'resultScoreOpponent' | 'resultVerification'>): PublicMatchResult | null {
  if (row.status !== 'completed' || row.resultOutcome === null || row.resultVerification === null) return null;
  return {
    scoreValkyria: row.resultScoreValkyria,
    scoreOpponent: row.resultScoreOpponent,
    outcome: row.resultOutcome,
    verification: row.resultVerification,
  };
}

async function toSummaries(db: Executor, rows: SummaryRow[]): Promise<PublicMatchSummary[]> {
  const logos = await loadPublicImages(
    db,
    rows.map((row) => row.opponentLogoAssetId),
  );
  return rows.map((row) => ({
    slug: row.slug,
    game: row.game,
    opponentName: row.opponentName,
    opponentShortCode: row.opponentShortCode,
    opponentLogo: row.opponentLogoAssetId ? (logos.get(row.opponentLogoAssetId) ?? null) : null,
    competitionType: row.competitionType,
    competitionName: row.competitionName,
    startsAt: row.startsAt.toISOString(),
    timeZone: row.timeZone,
    originalStartsAt: row.originalStartsAt?.toISOString() ?? null,
    status: row.status,
    result: publicResult(row),
  }));
}

/**
 * Published matches for the public Upcoming (scheduled/live/postponed, soonest first) or
 * Results (completed/cancelled, newest first) view with optional filters and opponent
 * search (case/diacritic-insensitive). Invalid optional filters are ignored.
 */
export async function listPublicMatches(db: Executor, input: PublicMatchListInput): Promise<PublicMatchPage> {
  const query = parseInput(publicMatchListSchema, input);
  const statuses = VIEW_STATUSES[query.view];
  if (query.status && !statuses.includes(query.status)) return { items: [], total: 0, page: query.page, pageCount: 1 };
  const where = and(
    isPublished,
    inArray(match.status, query.status ? [query.status] : [...statuses]),
    query.game ? eq(match.game, query.game) : undefined,
    query.competition ? eq(match.competitionType, query.competition) : undefined,
    query.q ? foldedContains([match.opponentName, match.opponentShortCode, match.competitionName], query.q) : undefined,
  );
  const [totalRow] = await db.select({ total: count() }).from(match).where(where);
  const total = totalRow?.total ?? 0;
  const order = query.view === 'upcoming' ? [asc(match.startsAt), asc(match.id)] : [desc(match.startsAt), desc(match.id)];
  const rows = await db
    .select(summaryColumns)
    .from(match)
    .leftJoin(matchResult, eq(matchResult.matchId, match.id))
    .where(where)
    .orderBy(...order)
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  return { items: await toSummaries(db, rows), total, page: query.page, pageCount: pageCount(total, query.pageSize) };
}

/**
 * Earliest published live match, or scheduled match starting at/after `now` (with a
 * short grace period for fixtures that have just started), else `null`.
 */
export async function getNextPublicMatch(db: Executor, now: Date = new Date(), game?: Game): Promise<PublicMatchSummary | null> {
  if (game !== undefined && !GAMES.includes(game)) return null;
  const rows = await db
    .select(summaryColumns)
    .from(match)
    .leftJoin(matchResult, eq(matchResult.matchId, match.id))
    .where(
      and(
        isPublished,
        game ? eq(match.game, game) : undefined,
        or(eq(match.status, 'live'), and(eq(match.status, 'scheduled'), gte(match.startsAt, new Date(now.getTime() - NEXT_MATCH_GRACE_MS)))),
      ),
    )
    .orderBy(asc(match.startsAt), asc(match.id))
    .limit(1);
  const [summary] = await toSummaries(db, rows);
  return summary ?? null;
}

/** Counts of published matches per public view, overall and per game. */
export async function getPublicMatchCounts(db: Executor): Promise<PublicMatchCounts> {
  const rows = await db
    .select({ game: match.game, status: match.status, n: count() })
    .from(match)
    .where(isPublished)
    .groupBy(match.game, match.status);
  const byGame = Object.fromEntries(GAMES.map((game) => [game, { upcoming: 0, results: 0 }])) as Record<Game, { upcoming: number; results: number }>;
  const counts: PublicMatchCounts = { upcoming: 0, results: 0, byGame };
  for (const row of rows) {
    const view: MatchListView | null = VIEW_STATUSES.upcoming.includes(row.status) ? 'upcoming' : VIEW_STATUSES.results.includes(row.status) ? 'results' : null;
    if (!view || !byGame[row.game]) continue;
    counts[view] += row.n;
    byGame[row.game][view] += row.n;
  }
  return counts;
}

async function loadRounds(db: Executor, matchId: string): Promise<PublicMatchRound[]> {
  const rows = await db.select().from(matchRound).where(eq(matchRound.matchId, matchId)).orderBy(asc(matchRound.ordinal));
  return rows.map((row) => ({
    ordinal: row.ordinal,
    mapName: row.mapName,
    mode: row.mode,
    side: row.side,
    scoreValkyria: row.scoreValkyria,
    scoreOpponent: row.scoreOpponent,
    outcome: row.outcome,
  }));
}

/**
 * Public detail of a published match: shared facts, result, rounds, links, cover and the
 * requested locale's published recap (or its explicit absence). `null` when the match is
 * unknown or not published; the two cases are indistinguishable.
 */
export async function getPublicMatch(db: Executor, slug: string, locale: Locale): Promise<PublicMatchDetail | null> {
  if (typeof slug !== 'string' || slug.length > 120 || !SLUG_PATTERN.test(slug) || !LOCALES.includes(locale)) return null;
  const [row] = await db
    .select({
      ...summaryColumns,
      season: match.season,
      format: match.format,
      bestOf: match.bestOf,
      teamSize: match.teamSize,
      eventUrl: match.eventUrl,
      vodLinks: match.vodLinks,
      coverAssetId: match.coverAssetId,
      tournamentId: match.tournamentId,
      publishedAt: match.publishedAt,
      updatedAt: match.updatedAt,
    })
    .from(match)
    .leftJoin(matchResult, eq(matchResult.matchId, match.id))
    .where(and(eq(match.slug, slug), isPublished))
    .limit(1);
  if (!row) return null;
  const [summary] = await toSummaries(db, [row]);
  const [rounds, recap, covers, statistics, linked] = await Promise.all([
    loadRounds(db, row.id),
    publishedProseFor(db, { kind: 'match', id: row.id }, locale),
    loadPublicImages(db, [row.coverAssetId]),
    loadMatchStatistics(db, row.id, { includePlayers: false }),
    row.tournamentId
      ? db
          .select({ slug: tournament.slug, game: tournament.game, name: tournament.name, season: tournament.season })
          .from(tournament)
          .where(and(eq(tournament.id, row.tournamentId), eq(tournament.publication, 'published')))
          .limit(1)
      : Promise.resolve([]),
  ]);
  let cover: PublicMatchDetail['cover'] = null;
  const image = row.coverAssetId ? covers.get(row.coverAssetId) : undefined;
  if (image) {
    if (recap.state === 'published' && recap.cover?.assetId.toLowerCase() === image.assetId.toLowerCase()) {
      cover = { ...image, alt: recap.cover.decorative ? '' : recap.cover.alt, caption: recap.cover.caption };
    } else {
      const defaults = await loadAssetDefaults(db, image.assetId);
      cover = { ...image, alt: (locale === 'cs' ? defaults?.altCs : defaults?.altEn) ?? '', caption: '' };
    }
  }
  return {
    ...summary!,
    season: row.season,
    format: row.format,
    bestOf: row.bestOf,
    teamSize: row.teamSize,
    eventUrl: row.eventUrl,
    vodLinks: row.vodLinks.map((link) => ({ url: link.url, label: link.label })),
    cover,
    rounds,
    statistics,
    recap,
    tournament: linked[0] ?? null,
    publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function adminResult(row: typeof matchResult.$inferSelect | null): AdminMatchResult | null {
  if (!row) return null;
  return {
    scoreValkyria: row.scoreValkyria,
    scoreOpponent: row.scoreOpponent,
    outcome: row.outcome,
    verification: row.verification,
    source: row.source,
    recordedAt: row.recordedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function adminItem(row: typeof match.$inferSelect, result: typeof matchResult.$inferSelect | null, recap: AdminMatchListItem['recap']): AdminMatchListItem {
  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    game: row.game,
    opponentName: row.opponentName,
    opponentShortCode: row.opponentShortCode,
    competitionType: row.competitionType,
    competitionName: row.competitionName,
    startsAt: row.startsAt.toISOString(),
    timeZone: row.timeZone,
    originalStartsAt: row.originalStartsAt?.toISOString() ?? null,
    status: row.status,
    publication: row.publication,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    result: adminResult(result),
    recap,
    isFixture: row.isFixture,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Admin list with search/status/publication/date filters. Requires `matches.edit`. */
export async function listMatchesForAdmin(db: Executor, actor: Actor, input: AdminMatchListInput = {}): Promise<AdminMatchPage> {
  await authorize(db, actor, 'matches.edit', { intent: 'read', action: 'match.list', entityType: 'match' });
  const query = parseInput(adminMatchListSchema, input);
  const scope = capabilityScope(actor, 'matches.edit');
  if (scope === null || (scope !== 'all' && scope.size === 0)) return { items: [], total: 0, page: query.page, pageCount: 0 };
  const conditions: (SQL | undefined)[] = [
    // Only matches of games in the actor's scope; the game filter never widens it.
    scope === 'all' ? undefined : inArray(match.game, [...scope]),
    query.game ? eq(match.game, query.game) : undefined,
    query.status ? eq(match.status, query.status) : undefined,
    query.publication ? eq(match.publication, query.publication) : undefined,
    query.from ? gte(match.startsAt, query.from) : undefined,
    query.to ? lte(match.startsAt, query.to) : undefined,
    query.q ? foldedContains([match.opponentName, match.opponentShortCode, match.competitionName, match.slug], query.q) : undefined,
  ];
  const where = and(...conditions);
  const [totalRow] = await db.select({ total: count() }).from(match).where(where);
  const total = totalRow?.total ?? 0;
  const rows = await db
    .select({ match, result: matchResult })
    .from(match)
    .leftJoin(matchResult, eq(matchResult.matchId, match.id))
    .where(where)
    .orderBy(desc(match.startsAt), desc(match.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const statuses = await loadProseStatuses(
    db,
    'match',
    rows.map((row) => row.match.id),
  );
  return {
    items: rows.map((row) => adminItem(row.match, row.result, statuses.get(row.match.id) ?? { cs: 'none', en: 'none' })),
    total,
    page: query.page,
    pageCount: pageCount(total, query.pageSize),
  };
}

/** Full admin record incl. internal notes and both locales' recap state. Requires `matches.edit`. */
export async function getMatchForAdmin(db: Executor, actor: Actor, id: string): Promise<AdminMatch | null> {
  await authorize(db, actor, 'matches.edit', { intent: 'read', action: 'match.read', entityType: 'match', entityId: id });
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select({ match, result: matchResult }).from(match).leftJoin(matchResult, eq(matchResult.matchId, match.id)).where(eq(match.id, id)).limit(1);
  if (!row) return null;
  await authorizeGames(db, actor, 'matches.edit', [row.match.game], { action: 'match.read', entityType: 'match', entityId: id });
  const [rounds, recapDetail, statistics] = await Promise.all([
    loadRounds(db, id),
    loadProseAdminDetail(db, { kind: 'match', id }),
    loadMatchStatistics(db, id, { includePlayers: true }),
  ]);
  const recap = { cs: recapDetail.cs.status, en: recapDetail.en.status };
  return {
    ...adminItem(row.match, row.result, recap),
    opponentLogoAssetId: row.match.opponentLogoAssetId,
    tournamentId: row.match.tournamentId,
    season: row.match.season,
    format: row.match.format,
    bestOf: row.match.bestOf,
    teamSize: row.match.teamSize,
    eventUrl: row.match.eventUrl,
    vodLinks: row.match.vodLinks,
    coverAssetId: row.match.coverAssetId,
    internalNotes: row.match.internalNotes,
    rounds,
    statistics,
    recapDetail,
    createdAt: row.match.createdAt.toISOString(),
  };
}


/** Published matches linked to a tournament, in playing order (at most 200). */
export async function listPublicTournamentMatches(db: Executor, tournamentId: string): Promise<PublicMatchSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(match)
    .leftJoin(matchResult, eq(matchResult.matchId, match.id))
    .where(and(isPublished, eq(match.tournamentId, tournamentId)))
    .orderBy(asc(match.startsAt), asc(match.id))
    .limit(200);
  return toSummaries(db, rows);
}

/** Game, slug and last-modified time of every published match (sitemap; shared across locales). */
export async function listPublicMatchesForSitemap(db: Executor): Promise<{ game: Game; slug: string; updatedAt: Date }[]> {
  return db
    .select({ game: match.game, slug: match.slug, updatedAt: match.updatedAt })
    .from(match)
    .where(isPublished)
    .orderBy(desc(match.startsAt))
    .limit(5000);
}
