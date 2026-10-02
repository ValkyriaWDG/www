import 'server-only';
import { logiMemberLink, logiSyncScope, memberProfile, type Executor, type Game } from '@valkyria/db';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { assertCanForGames } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { gameRouteFromDb, GAME_REGISTRY } from '@/modules/games/registry';
import { configuredLogiSources, type ConfiguredLogiSource, type LogiIntegrationEnv } from './logi-config';
import type { LogiMemberCandidate, LogiPeopleState, LogiTeamAttendance, LogiTeamRoster, LogiTeamView, PublicLogiEventPeople, PublicLogiMemberEnrichment, PublicRosterEntry } from './logi-people-types';
import { readPublicLogiEvents } from './logi-public';
import { readActiveLogiProjections, readLogiProjectionState } from './logi-store';
import { logiSyncCheckpointSchema } from './logi/sync';
import { LOGI_PEOPLE_RESOURCES, logiMemberSummarySchema, logiPlayerStatSummarySchema, logiRosterSummarySchema, type LogiMemberSummary, type LogiPlayerStatSummary, type LogiRosterSummary } from './logi/people-contracts';
import { currentPlayerSessions, currentReferencedMember, isRecentPeopleInstant, PEOPLE_FRESH_MS, PEOPLE_STALE_MS, summarizePlayerSessions } from './logi/people-mapping';

export type { LogiMemberCandidate, LogiTeamView, PublicLogiMemberEnrichment, PublicLogiEventPeople } from './logi-people-types';
type Options = { now?: () => Date };
type PeopleSnapshot = {
  source: ConfiguredLogiSource;
  state: LogiPeopleState;
  observedAt: string | null;
  reconciledAt: string | null;
  version: number | null;
  members: Map<string, LogiMemberSummary>;
  rosters: LogiRosterSummary[];
  sessions: LogiPlayerStatSummary[];
};
const emptyTeam = (state: LogiPeopleState): LogiTeamView => ({ state, observedAt: null, members: [], rosters: [], attendance: [] });
const sourceGame = (game: Game) => GAME_REGISTRY[gameRouteFromDb(game)].logi;
const forbiddenSource = new Set(['unauthorized', 'forbidden', 'configuration']);

/** Ordinary team reads may show labelled last-known data, never use it as access evidence. */
async function readSnapshot(db: Executor, source: ConfiguredLogiSource, options: Options): Promise<PeopleSnapshot> {
  const rows = await readActiveLogiProjections(db, source);
  const state = rows[0] ?? await readLogiProjectionState(db, source);
  const checkpoint = logiSyncCheckpointSchema.safeParse(state?.checkpoint);
  const at = options.now?.() ?? new Date();
  const observedAt = state?.lastSuccessAt?.toISOString() ?? null;
  const reconciledAt = checkpoint.success ? checkpoint.data.reconciledAt ?? null : null;
  const fresh = checkpoint.success && checkpoint.data.mode === 'live' && !state?.errorCode
    && isRecentPeopleInstant(observedAt, at) && isRecentPeopleInstant(reconciledAt, at);
  const stale = checkpoint.success && !forbiddenSource.has(state?.errorCode ?? '') && isRecentPeopleInstant(observedAt, at, PEOPLE_STALE_MS);
  const snapshot: PeopleSnapshot = { source, state: fresh ? 'fresh' : stale ? 'stale' : 'unavailable', observedAt, reconciledAt, version: checkpoint.success ? checkpoint.data.version : null, members: new Map(), rosters: [], sessions: [] };
  if (snapshot.state === 'unavailable') return snapshot;
  for (const row of rows) {
    if (!(LOGI_PEOPLE_RESOURCES as readonly string[]).includes(row.resource)) throw new Error('Invalid people projection resource.');
    if (row.operation === 'remove') continue;
    const value = row.resource === 'member-summaries' ? logiMemberSummarySchema.parse(row.data)
      : row.resource === 'roster-summaries' ? logiRosterSummarySchema.parse(row.data) : logiPlayerStatSummarySchema.parse(row.data);
    if (value.id !== row.externalId || value.guildId !== source.guildId || value.gameId !== source.gameId) throw new Error('Invalid people projection identity.');
    if ('identityState' in value) snapshot.members.set(value.id, value);
    else if ('squads' in value) snapshot.rosters.push(value);
    else {
      if ((value.provider === 'hll_crcon') !== (source.gameId === 'hell_let_loose')) throw new Error('Invalid player source game.');
      snapshot.sessions.push(value);
    }
  }
  // A generation is one bounded observation set. Do not silently report totals from
  // only its newer sessions when an older identity attribution has expired.
  if (snapshot.sessions.some((session) => !isRecentPeopleInstant(session.attributionCheckedAt, at)
    || Date.parse(session.fetchedAt) > at.getTime() + 5_000)) {
    snapshot.state = 'unavailable';
    snapshot.members.clear();
    snapshot.rosters = [];
    snapshot.sessions = [];
    return snapshot;
  }
  snapshot.sessions = currentPlayerSessions(snapshot.sessions, at);
  return snapshot;
}

function stillPublic(snapshot: PeopleSnapshot, at: Date): boolean {
  return snapshot.state === 'fresh' && isRecentPeopleInstant(snapshot.observedAt, at) && isRecentPeopleInstant(snapshot.reconciledAt, at)
    && snapshot.sessions.every((session) => isRecentPeopleInstant(session.attributionCheckedAt, at));
}

function teamRows(snapshot: PeopleSnapshot): Pick<LogiTeamView, 'rosters' | 'attendance'> {
  const attendance = new Map<string, LogiTeamAttendance>();
  const rosters: LogiTeamRoster[] = snapshot.rosters.map((roster) => {
    const slot = (reference: LogiRosterSummary['reserves'][number], index: number) => {
      const member = currentReferencedMember(snapshot.members, reference);
      if (member) attendance.set(`${roster.eventId}:${member.id}`, { eventId: roster.eventId, memberId: member.id, displayName: member.displayName, status: reference.attendance, completed: null });
      return { memberId: member?.id ?? null, displayName: member?.displayName ?? null, index, attendance: member ? reference.attendance : null };
    };
    const squads = roster.squads.map((squad) => ({ index: squad.index, name: squad.name, slots: squad.slots.map((reference) => slot(reference, reference.index)) }));
    const reserves = roster.reserves.map(slot);
    for (const reference of roster.notAttending) {
      const member = currentReferencedMember(snapshot.members, reference);
      if (member) attendance.set(`${roster.eventId}:${member.id}`, { eventId: roster.eventId, memberId: member.id, displayName: member.displayName, status: 'not_attending', completed: null });
    }
    for (const reference of roster.eventParticipation) {
      const member = currentReferencedMember(snapshot.members, reference);
      if (member) attendance.set(`${roster.eventId}:${member.id}`, { eventId: roster.eventId, memberId: member.id, displayName: member.displayName, status: reference.status, completed: reference.completed });
    }
    return { id: roster.id, eventId: roster.eventId, updatedAt: roster.updatedAt, squads, reserves };
  });
  return { rosters, attendance: [...attendance.values()] };
}

export async function readLogiTeam(db: Executor, env: LogiIntegrationEnv, actor: Actor, game: Game, options: Options = {}): Promise<LogiTeamView> {
  assertCanForGames(actor, 'team.read', [game], 'read');
  try {
    const source = configuredLogiSources(env, 'people').find((row) => row.gameId === sourceGame(game));
    if (!source) return emptyTeam('unconfigured');
    const snapshot = await readSnapshot(db, source, options);
    return {
      state: snapshot.state, observedAt: snapshot.observedAt,
      members: [...snapshot.members.values()].map((member) => ({ memberId: member.id, displayName: member.displayName, type: member.type, status: member.status, paused: member.paused, identityState: member.identityState, groups: member.groups.map((group) => group.name), statistics: summarizePlayerSessions(snapshot.sessions, member) })),
      ...teamRows(snapshot),
    };
  } catch { return emptyTeam('unavailable'); }
}

/** Candidates are not usable while a source is stale, rebuilding, revoked or ambiguous. */
export async function readLogiMemberCandidates(db: Executor, env: LogiIntegrationEnv, actor: Actor, game: Game, options: Options = {}): Promise<LogiMemberCandidate[]> {
  assertCanForGames(actor, 'members.edit', [game], 'read');
  try {
    const source = configuredLogiSources(env, 'people').find((row) => row.gameId === sourceGame(game));
    if (!source) return [];
    const snapshot = await readSnapshot(db, source, options);
    if (!stillPublic(snapshot, options.now?.() ?? new Date())) return [];
    return [...snapshot.members.values()].flatMap((member) => member.identityState === 'resolved' && member.identityId ? [{
      scopeKey: source.scopeKey, sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId,
      memberId: member.id, identityId: member.identityId, displayName: member.displayName, type: member.type, status: member.status,
    }] : []);
  } catch { return []; }
}

type ApprovedLink = { member: LogiMemberSummary; slug: string; displayName: string; allowStats: boolean; allowRoster: boolean };

/** The final SQL read rechecks local consent and publication; source payloads cannot grant it. */
async function approvedLinks(db: Executor, snapshots: readonly PeopleSnapshot[], profileSlug?: string): Promise<Map<string, Map<string, ApprovedLink>>> {
  if (!snapshots.length) return new Map();
  const rows = await db.select({ link: logiMemberLink, slug: memberProfile.slug, displayName: memberProfile.displayName, games: memberProfile.games })
    .from(logiMemberLink).innerJoin(memberProfile, eq(memberProfile.id, logiMemberLink.profileId))
    .innerJoin(logiSyncScope, and(eq(logiSyncScope.scopeKey, logiMemberLink.scopeKey), isNull(logiSyncScope.errorCode)))
    .where(and(or(...snapshots.map(({ source, version }) => and(eq(logiMemberLink.scopeKey, source.scopeKey), eq(logiMemberLink.sourceInstanceId, source.sourceInstanceId), eq(logiMemberLink.guildId, source.guildId), eq(logiMemberLink.gameId, source.gameId), eq(logiSyncScope.version, version ?? -1)))), eq(memberProfile.state, 'published'), isNotNull(memberProfile.consentConfirmedAt), ...(profileSlug !== undefined ? [eq(memberProfile.slug, profileSlug)] : [])));
  const links = new Map<string, Map<string, ApprovedLink>>();
  for (const row of rows) {
    const snapshot = snapshots.find((entry) => entry.source.scopeKey === row.link.scopeKey)!;
    const game: Game = snapshot.source.gameId === 'wardogs' ? 'wardogs' : 'hell-let-loose';
    const member = snapshot.members.get(row.link.memberId);
    if (member?.identityState !== 'resolved' || !member.identityId || member.identityId !== row.link.identityId || !row.games.includes(game)) continue;
    const scoped = links.get(row.link.scopeKey) ?? new Map<string, ApprovedLink>();
    scoped.set(member.id, { member, slug: row.slug, displayName: row.displayName, allowStats: row.link.allowStats, allowRoster: row.link.allowRoster });
    links.set(row.link.scopeKey, scoped);
  }
  return links;
}

function publicRoster(snapshot: PeopleSnapshot, links: ReadonlyMap<string, ApprovedLink>, eventIds: ReadonlySet<string>): PublicRosterEntry[] {
  const entries: PublicRosterEntry[] = [];
  for (const roster of snapshot.rosters) {
    if (!eventIds.has(roster.eventId)) continue;
    const add = (reference: LogiRosterSummary['reserves'][number], squad: string | null, slot: number | null, reserve: boolean) => {
      const member = currentReferencedMember(snapshot.members, reference);
      const link = member ? links.get(member.id) : null;
      if (link?.allowRoster) entries.push({ eventId: roster.eventId, profileSlug: link.slug, displayName: link.displayName, squad, slot, reserve });
    };
    for (const squad of roster.squads) for (const reference of squad.slots) add(reference, squad.name, reference.index, false);
    for (const reference of roster.reserves) add(reference, null, null, true);
  }
  return entries;
}

export async function readPublicLogiMemberEnrichment(db: Executor, env: LogiIntegrationEnv, profileSlug: string, options: Options & { game?: Game } = {}): Promise<PublicLogiMemberEnrichment[]> {
  try {
    const result: PublicLogiMemberEnrichment[] = [];
    const prepared: { snapshot: PeopleSnapshot; game: Game; eventIds: Set<string> }[] = [];
    for (const source of configuredLogiSources(env, 'people')) {
      const game: Game = source.gameId === 'wardogs' ? 'wardogs' : 'hell-let-loose';
      if (options.game && options.game !== game) continue;
      const snapshot = await readSnapshot(db, source, options);
      if (!stillPublic(snapshot, options.now?.() ?? new Date())) continue;
      // A member's explicit statistics consent may apply without publishing any match.
      const events = await readPublicLogiEvents(db, env, gameRouteFromDb(game), options.now?.() ?? new Date()).catch(() => []);
      const eventIds = new Set(events.filter((event) => event.ref.sourceInstanceId === source.sourceInstanceId && event.ref.guildId === source.guildId).map((event) => event.ref.externalId));
      prepared.push({ snapshot, game, eventIds });
    }
    // One last joined read fences consent, binding and the source checkpoint for every game.
    const allLinks = await approvedLinks(db, prepared.map(({ snapshot }) => snapshot), profileSlug);
    const decisionAt = options.now?.() ?? new Date();
    for (const { snapshot, game, eventIds } of prepared) {
      const links = allLinks.get(snapshot.source.scopeKey) ?? new Map<string, ApprovedLink>();
      if (!stillPublic(snapshot, decisionAt)) continue;
      for (const link of links.values()) {
        if (!link.allowStats && !link.allowRoster) continue;
        result.push({ game, observedAt: snapshot.observedAt!,
          statistics: link.allowStats ? summarizePlayerSessions(snapshot.sessions, link.member) : null,
          rosters: link.allowRoster ? publicRoster(snapshot, links, eventIds) : [],
        });
      }
    }
    return result;
  } catch { return []; }
}

export async function readPublicLogiEventPeople(db: Executor, env: LogiIntegrationEnv, game: Game, eventId: string, options: Options = {}): Promise<PublicLogiEventPeople | null> {
  try {
    const source = configuredLogiSources(env, 'people').find((row) => row.gameId === sourceGame(game));
    if (!source) return null;
    const events = await readPublicLogiEvents(db, env, gameRouteFromDb(game), options.now?.() ?? new Date());
    const event = events.find((row) => row.ref.externalId === eventId && row.ref.sourceInstanceId === source.sourceInstanceId && row.ref.guildId === source.guildId);
    if (!event) return null;
    const snapshot = await readSnapshot(db, source, options);
    if (!stillPublic(snapshot, options.now?.() ?? new Date())) return null;
    const allLinks = await approvedLinks(db, [snapshot]);
    const links = allLinks.get(snapshot.source.scopeKey) ?? new Map<string, ApprovedLink>();
    const decisionAt = options.now?.() ?? new Date();
    if (!stillPublic(snapshot, decisionAt)) return null;
    const sessions = snapshot.sessions.filter((session) => session.eventRefs.some((ref) => ref.eventId === eventId && ref.resultVersion === event.result.version && ref.resultState === event.result.state));
    return { observedAt: snapshot.observedAt!, roster: publicRoster(snapshot, links, new Set([eventId])),
      statistics: [...links.values()].flatMap((link) => {
        const statistics = link.allowStats ? summarizePlayerSessions(sessions, link.member) : null;
        return statistics ? [{ profileSlug: link.slug, displayName: link.displayName, statistics }] : [];
      }),
    };
  } catch { return null; }
}

export { PEOPLE_FRESH_MS };
