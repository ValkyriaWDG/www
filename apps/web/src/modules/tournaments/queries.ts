import 'server-only';
import { GAMES, LOCALES, match, tournament, type Executor, type Game, type Locale } from '@valkyria/db';
import { and, asc, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { capabilityScope } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { zonedDate } from '@/modules/matches/time';
import { listPublicTournamentMatches } from '@/modules/matches/queries';
import { authorize, authorizeGames, foldedContains, pageCount, parseInput } from '@/modules/prose/domain';
import { loadProseAdminDetail, loadProseStatuses, publishedProseFor } from '@/modules/prose/queries';
import { SLUG_PATTERN } from '@/modules/prose/slug';
import { tournamentPhase } from './phase';
import { publishedEditorialArchives } from '@/modules/legacy/editorial-public';
import { isLegacyHllUrl } from '@/modules/legacy/hll';
import { adminTournamentListSchema, type AdminTournamentListInput } from './schemas';
import type {
  AdminTournament,
  AdminTournamentListItem,
  AdminTournamentPage,
  PublicTournamentDetail,
  PublicTournamentSummary,
  TournamentOption,
  TournamentPhase,
} from './types';

/** Calendar days are interpreted in the community's zone. */
const TOURNAMENT_TIME_ZONE = 'Europe/Prague';

const isPublished = eq(tournament.publication, 'published');

/** Current, upcoming and undated competitions first, then finished ones newest first. */
const PHASE_ORDER: Record<TournamentPhase, number> = { ongoing: 0, upcoming: 1, undated: 2, finished: 3 };

const summaryColumns = {
  id: tournament.id,
  slug: tournament.slug,
  game: tournament.game,
  name: tournament.name,
  season: tournament.season,
  organizer: tournament.organizer,
  startsOn: tournament.startsOn,
  endsOn: tournament.endsOn,
};

type SummaryRow = { id: string; slug: string; game: Game; name: string; season: string | null; organizer: string | null; startsOn: string | null; endsOn: string | null };

async function publishedMatchCounts(db: Executor, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: match.tournamentId, total: count() })
    .from(match)
    .where(and(inArray(match.tournamentId, ids), eq(match.publication, 'published')))
    .groupBy(match.tournamentId);
  return new Map(rows.map((row) => [row.id!, row.total]));
}

function toSummary(row: SummaryRow, today: string, matchCount: number): PublicTournamentSummary {
  return {
    slug: row.slug,
    game: row.game,
    name: row.name,
    season: row.season,
    organizer: row.organizer,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    phase: tournamentPhase(row.startsOn, row.endsOn, today),
    matchCount,
  };
}

/**
 * Published tournaments of one game: ongoing, upcoming and undated first (soonest start
 * first), then finished ones (latest end first). At most 200 records.
 */
export async function listPublicTournaments(db: Executor, game: Game, now: Date = new Date(), locale: Locale = 'cs'): Promise<PublicTournamentSummary[]> {
  if (!GAMES.includes(game)) return [];
  const rows = await db
    .select(summaryColumns)
    .from(tournament)
    .where(and(isPublished, eq(tournament.game, game)))
    .orderBy(desc(tournament.startsOn), asc(tournament.name))
    .limit(200);
  const today = zonedDate(now, TOURNAMENT_TIME_ZONE);
  const counts = await publishedMatchCounts(db, rows.map((row) => row.id));
  const archives = await publishedEditorialArchives(db, { kind: 'tournament', ids: rows.map((row) => row.id) }, locale);
  const items = rows.map((row) => ({ ...toSummary(row, today, counts.get(row.id) ?? 0), archiveEditorial: archives.get(row.id) ?? null }));
  return items.sort((a, b) => {
    const phase = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
    if (phase !== 0) return phase;
    if (a.phase === 'finished') return (b.endsOn ?? b.startsOn ?? '').localeCompare(a.endsOn ?? a.startsOn ?? '');
    return (a.startsOn ?? '9999').localeCompare(b.startsOn ?? '9999') || a.name.localeCompare(b.name);
  });
}

/**
 * Public detail of a published tournament of `game`: facts, links, the requested locale's
 * published description (or its explicit absence) and the published linked matches.
 * `null` when unknown, unpublished or of another game; the cases are indistinguishable.
 */
export async function getPublicTournament(db: Executor, game: Game, slug: string, locale: Locale, now: Date = new Date()): Promise<PublicTournamentDetail | null> {
  if (typeof slug !== 'string' || slug.length > 120 || !SLUG_PATTERN.test(slug) || !LOCALES.includes(locale) || !GAMES.includes(game)) return null;
  const [row] = await db
    .select({ ...summaryColumns, links: tournament.links, publishedAt: tournament.publishedAt, updatedAt: tournament.updatedAt })
    .from(tournament)
    .where(and(eq(tournament.slug, slug), eq(tournament.game, game), isPublished))
    .limit(1);
  if (!row) return null;
  const [description, matches] = await Promise.all([
    publishedProseFor(db, { kind: 'tournament', id: row.id }, locale),
    listPublicTournamentMatches(db, row.id),
  ]);
  return {
    ...toSummary(row, zonedDate(now, TOURNAMENT_TIME_ZONE), matches.length),
    archiveEditorial: (await publishedEditorialArchives(db, { kind: 'tournament', ids: [row.id] }, locale)).get(row.id) ?? null,
    // Earlier imports stored a link to the former website, which public pages never show.
    links: row.links.filter((link) => !isLegacyHllUrl(link.url)).map((link) => ({ url: link.url, label: link.label })),
    description,
    matches,
    publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Game, slug and last-modified time of every published tournament (sitemap). */
export async function listPublicTournamentsForSitemap(db: Executor): Promise<{ game: Game; slug: string; updatedAt: Date }[]> {
  return db
    .select({ game: tournament.game, slug: tournament.slug, updatedAt: tournament.updatedAt })
    .from(tournament)
    .where(isPublished)
    .orderBy(desc(tournament.updatedAt))
    .limit(2000);
}

async function allMatchCounts(db: Executor, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: match.tournamentId, total: count() })
    .from(match)
    .where(inArray(match.tournamentId, ids))
    .groupBy(match.tournamentId);
  return new Map(rows.map((row) => [row.id!, row.total]));
}

function adminItem(row: typeof tournament.$inferSelect, matchCount: number, description: AdminTournamentListItem['description']): AdminTournamentListItem {
  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    game: row.game,
    name: row.name,
    season: row.season,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    publication: row.publication,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    matchCount,
    description,
    isFixture: row.isFixture,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Admin list within the actor's game scope. Requires `matches.edit`. */
export async function listTournamentsForAdmin(db: Executor, actor: Actor, input: AdminTournamentListInput = {}): Promise<AdminTournamentPage> {
  await authorize(db, actor, 'matches.edit', { intent: 'read', action: 'tournament.list', entityType: 'tournament' });
  const query = parseInput(adminTournamentListSchema, input);
  const scope = capabilityScope(actor, 'matches.edit');
  if (scope === null || (scope !== 'all' && scope.size === 0)) return { items: [], total: 0, page: query.page, pageCount: 0 };
  const conditions: (SQL | undefined)[] = [
    scope === 'all' ? undefined : inArray(tournament.game, [...scope]),
    query.game ? eq(tournament.game, query.game) : undefined,
    query.publication ? eq(tournament.publication, query.publication) : undefined,
    query.q ? foldedContains([tournament.name, tournament.season, tournament.organizer, tournament.slug], query.q) : undefined,
  ];
  const where = and(...conditions);
  const [totalRow] = await db.select({ total: count() }).from(tournament).where(where);
  const total = totalRow?.total ?? 0;
  const rows = await db
    .select()
    .from(tournament)
    .where(where)
    .orderBy(sql`${tournament.startsOn} desc nulls first`, desc(tournament.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const ids = rows.map((row) => row.id);
  const [statuses, counts] = await Promise.all([loadProseStatuses(db, 'tournament', ids), allMatchCounts(db, ids)]);
  return {
    items: rows.map((row) => adminItem(row, counts.get(row.id) ?? 0, statuses.get(row.id) ?? { cs: 'none', en: 'none' })),
    total,
    page: query.page,
    pageCount: pageCount(total, query.pageSize),
  };
}

/** Full admin record incl. internal notes, both locales' description state and linked matches. */
export async function getTournamentForAdmin(db: Executor, actor: Actor, id: string): Promise<AdminTournament | null> {
  await authorize(db, actor, 'matches.edit', { intent: 'read', action: 'tournament.read', entityType: 'tournament', entityId: id });
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(tournament).where(eq(tournament.id, id)).limit(1);
  if (!row) return null;
  await authorizeGames(db, actor, 'matches.edit', [row.game], { action: 'tournament.read', entityType: 'tournament', entityId: id });
  const [descriptionDetail, matches] = await Promise.all([
    loadProseAdminDetail(db, { kind: 'tournament', id }),
    db
      .select({ id: match.id, slug: match.slug, opponentName: match.opponentName, startsAt: match.startsAt, timeZone: match.timeZone, publication: match.publication })
      .from(match)
      .where(eq(match.tournamentId, id))
      .orderBy(asc(match.startsAt), asc(match.id))
      .limit(200),
  ]);
  return {
    ...adminItem(row, matches.length, { cs: descriptionDetail.cs.status, en: descriptionDetail.en.status }),
    organizer: row.organizer,
    links: row.links,
    internalNotes: row.internalNotes,
    descriptionDetail,
    matches: matches.map((item) => ({ ...item, startsAt: item.startsAt.toISOString() })),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Tournaments of `game` the match editor may link (within the actor's scope). */
export async function listTournamentOptions(db: Executor, actor: Actor, game: Game): Promise<TournamentOption[]> {
  await authorize(db, actor, 'matches.edit', { intent: 'read', action: 'tournament.list', entityType: 'tournament' });
  const scope = capabilityScope(actor, 'matches.edit');
  if (!GAMES.includes(game) || scope === null || (scope !== 'all' && !scope.has(game))) return [];
  return db
    .select({ id: tournament.id, name: tournament.name, season: tournament.season, publication: tournament.publication })
    .from(tournament)
    .where(eq(tournament.game, game))
    .orderBy(sql`${tournament.startsOn} desc nulls first`, asc(tournament.name))
    .limit(200);
}

/** Tournament options for every game in the actor's scope (match editor). */
export async function listTournamentOptionsByGame(db: Executor, actor: Actor): Promise<Partial<Record<Game, TournamentOption[]>>> {
  const entries = await Promise.all(GAMES.map(async (game) => [game, await listTournamentOptions(db, actor, game)] as const));
  return Object.fromEntries(entries.filter(([, options]) => options.length > 0));
}
