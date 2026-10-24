import 'server-only';
import { createHash } from 'node:crypto';
import { logiMemberLink, logiSyncScope, memberProfile, type Executor, type Game } from '@valkyria/db';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { configuredLogiSourceBindings, configuredLogiSources, type ConfiguredLogiSource, type LogiIntegrationEnv } from './logi-config';
import { isCurrentLogiPeopleSnapshot, logiPeopleSnapshotFence, readLogiPeopleSnapshot, readLogiStatisticsSnapshot, readScopedLogiPeopleEvents, type LogiPeopleSnapshot } from './logi-people';
import type { PlayerStatisticsSummary } from './logi-people-types';
import { currentReferencedMember, summarizePlayerSessions } from './logi/people-mapping';
import type { LogiMemberSummary } from './logi/people-contracts';
import { logiEventHref } from './logi/public-matches';
import type { PublicLogiEvent } from './logi/mapping';

export type PublicPlayerRoster = { href: string; title: string; startsAt: string | null; squad: string | null; slot: number | null; reserve: boolean };
export type PublicPlayerGame = { game: Game; observedAt: string; statistics: PlayerStatisticsSummary | null; rosters: PublicPlayerRoster[] };
/** Owner-authorized supplied game names, independent of editorial biography consent. */
export type PublicLogiPlayer = { key: string; href: string; displayName: string | null; games: Game[]; profileSlug: string | null; activity: PublicPlayerGame[] };
export type PublicPlayerMatchPeople = {
  roster: { href: string; displayName: string | null; squad: string | null; slot: number | null; reserve: boolean }[];
  statistics: { href: string; displayName: string | null; statistics: PlayerStatisticsSummary }[];
};
export type PublicPlayerAvailability = { state: 'disabled' | 'complete' | 'partial' | 'unavailable'; enabledGames: Game[]; currentGames: Game[] };
export type PublicPlayerDirectory = { players: PublicLogiPlayer[]; availability: PublicPlayerAvailability };

/** Preserve distinct same-labelled squad slots while composing two views of the same roster. */
export function mergePublicPlayerRosterRows(approved: PublicPlayerMatchPeople['roster'], source: PublicPlayerMatchPeople['roster']): PublicPlayerMatchPeople['roster'] {
  const group = (rows: PublicPlayerMatchPeople['roster']) => {
    const groups = new Map<string, PublicPlayerMatchPeople['roster']>();
    for (const row of rows) {
      const key = JSON.stringify([row.href, row.squad, row.slot, row.reserve]);
      groups.set(key, [...groups.get(key) ?? [], row]);
    }
    return groups;
  };
  const left = group(approved), right = group(source);
  return [...new Set([...left.keys(), ...right.keys()])].flatMap((key) => {
    const before = left.get(key) ?? [], after = right.get(key) ?? [];
    return after.length >= before.length ? after : before.map((row, index) => after[index] ?? row);
  });
}

type Options = { now?: () => Date; game?: Game; eventId?: string };
type Prepared = { snapshot: LogiPeopleSnapshot; statistics: LogiPeopleSnapshot | null; game: Game; events: PublicLogiEvent[] };
type StatisticsTarget = { source: ConfiguredLogiSource; member: LogiMemberSummary; version: number };
type Publication = PublicPlayerDirectory & { targets: (StatisticsTarget & { key: string })[] };

/** Never a source nickname, Discord identifier or provider identifier in a public URL. */
export function publicLogiPlayerKey(source: Pick<ConfiguredLogiSource, 'sourceInstanceId' | 'guildId' | 'gameId'>, member: Pick<LogiMemberSummary, 'id' | 'identityId' | 'identityState'>): string {
  const identity = member.identityState === 'resolved' && member.identityId
    ? ['identity', member.identityId] : ['unresolved-assignment', source.gameId, member.id];
  return createHash('sha256').update(JSON.stringify(['public-player-v1', source.sourceInstanceId, source.guildId, ...identity])).digest('hex');
}

function eventIndex(events: readonly PublicLogiEvent[]) {
  return new Map(events.flatMap((event) => [event.ref.externalId, ...event.aliases ?? []].map((id) => [id, event] as const)));
}

function rosterActivity(snapshot: LogiPeopleSnapshot, member: LogiMemberSummary, events: readonly PublicLogiEvent[], selectedId?: string): PublicPlayerRoster[] {
  const index = eventIndex(events);
  const selected = selectedId ? index.get(selectedId) : null;
  if (selectedId && !selected) return [];
  const rows = new Map<string, PublicPlayerRoster>();
  for (const roster of snapshot.rosters) {
    const event = index.get(roster.eventId);
    if (!event || selected && event !== selected) continue;
    const add = (reference: typeof roster.reserves[number], squadIndex: number | null, squad: string | null, slot: number | null, reserve: boolean) => {
      const resolved = currentReferencedMember(snapshot.members, reference);
      if (resolved?.id !== member.id || resolved.identityId !== member.identityId) return;
      const key = JSON.stringify([event.ref.externalId, member.id, member.identityId, squadIndex, slot, reserve]);
      rows.set(key, { href: logiEventHref(event), title: event.title, startsAt: event.startsAt, squad, slot, reserve });
    };
    for (const squad of roster.squads) for (const slot of squad.slots) add(slot, squad.index, squad.name, slot.index, false);
    for (const reserve of roster.reserves) add(reserve, null, null, null, true);
  }
  return [...rows.values()].sort((a, b) => Date.parse(b.startsAt ?? '1970-01-01') - Date.parse(a.startsAt ?? '1970-01-01') || a.href.localeCompare(b.href));
}

/**
 * Publication is enabled only by the configured owner's source/game policy. Private
 * operational data is projected through an explicit allowlist, never spread to DTOs.
 * Exact editorial withdrawals and independent roster/statistics opt-outs still win.
 */
async function readPlayerPublication(db: Executor, env: LogiIntegrationEnv, options: Options, facts = true): Promise<Publication> {
  let enabledGames: Game[] = [];
  const unavailable = (): Publication => ({ players: [], targets: [], availability: { state: 'unavailable', enabledGames, currentGames: [] } });
  try {
    const at = options.now?.() ?? new Date();
    const fixed = { now: () => at };
    const prepared: Prepared[] = [];
    const enabled = configuredLogiSourceBindings(env).filter((source) => source.publishPlayers && (!options.game || options.game === (source.gameId === 'wardogs' ? 'wardogs' : 'hell-let-loose')));
    enabledGames = [...new Set(enabled.map((source) => source.gameId === 'wardogs' ? 'wardogs' as const : 'hell-let-loose' as const))];
    if (!enabled.length) return { players: [], targets: [], availability: { state: 'disabled', enabledGames, currentGames: [] } };
    const sources = configuredLogiSources(env, 'people').filter((source) => enabled.some((binding) => binding.sourceInstanceId === source.sourceInstanceId && binding.guildId === source.guildId && binding.gameId === source.gameId));
    for (const source of sources) {
      const game = source.gameId === 'wardogs' ? 'wardogs' : 'hell-let-loose';
      const snapshot = await readLogiPeopleSnapshot(db, source, fixed).catch(() => null);
      if (!snapshot || !isCurrentLogiPeopleSnapshot(snapshot, at)) continue;
      const [statistics, events] = await Promise.all([
        facts ? readLogiStatisticsSnapshot(db, source, fixed) : Promise.resolve(null),
        facts ? readScopedLogiPeopleEvents(db, env, source, game, at).catch(() => []) : Promise.resolve([]),
      ]);
      prepared.push({ snapshot, statistics, events, game });
    }
    if (!prepared.length) return unavailable();
    const statisticsCurrent = or(...prepared.flatMap(({ snapshot, statistics }) => statistics && isCurrentLogiPeopleSnapshot(statistics, at)
      ? [and(eq(logiSyncScope.scopeKey, snapshot.source.scopeKey), logiPeopleSnapshotFence(db, statistics))] : [])) ?? sql<boolean>`false`;
    // One final statement observes source versions and every exact editorial link,
    // including hidden/withdrawn profiles. Missing links cannot bypass a race here.
    const rows = await db.select({ scopeKey: logiSyncScope.scopeKey, link: logiMemberLink,
      profileSlug: memberProfile.slug, profileName: memberProfile.displayName, profileState: memberProfile.state,
      consent: memberProfile.consentConfirmedAt, profileGames: memberProfile.games, statisticsCurrent })
      .from(logiSyncScope)
      .leftJoin(logiMemberLink, and(eq(logiMemberLink.sourceInstanceId, logiSyncScope.sourceInstanceId), eq(logiMemberLink.guildId, logiSyncScope.guildId), eq(logiMemberLink.gameId, logiSyncScope.gameId)))
      .leftJoin(memberProfile, eq(memberProfile.id, logiMemberLink.profileId))
      .where(and(isNull(logiSyncScope.errorCode), or(...prepared.map(({ snapshot }) => and(
        eq(logiSyncScope.scopeKey, snapshot.source.scopeKey), eq(logiSyncScope.version, snapshot.version ?? -1),
        eq(logiSyncScope.sourceInstanceId, snapshot.source.sourceInstanceId), eq(logiSyncScope.guildId, snapshot.source.guildId), eq(logiSyncScope.gameId, snapshot.source.gameId),
      )))));
    const decisionAt = options.now?.() ?? new Date();
    const result = new Map<string, PublicLogiPlayer>();
    const targets: Publication['targets'] = [];
    const blocked = new Set<string>();
    const currentGames = new Set<Game>();
    let currentSources = 0;
    for (const { snapshot, statistics, game, events } of prepared) {
      const scoped = rows.filter((row) => row.scopeKey === snapshot.source.scopeKey);
      if (!scoped.length || !isCurrentLogiPeopleSnapshot(snapshot, decisionAt)) continue;
      currentSources++;
      currentGames.add(game);
      for (const member of snapshot.members.values()) {
        const key = publicLogiPlayerKey(snapshot.source, member);
        const associated = scoped.filter(({ link }) => link && (member.identityState === 'resolved' ? link.identityId === member.identityId : link.memberId === member.id)
          && link.sourceInstanceId === snapshot.source.sourceInstanceId && link.guildId === snapshot.source.guildId && link.gameId === snapshot.source.gameId);
        // Neither key rotation nor assignment recreation erases an exact native
        // person's withdrawal/opt-outs. An unresolved/conflicting identity retains
        // negative decisions for its exact assignment only, never positive authority.
        if (associated.some((row) => row.profileState !== 'published' || !row.consent || !row.profileGames?.includes(game))) { blocked.add(key); continue; }
        const exact = member.identityState === 'resolved' ? associated.find((row) => row.link?.scopeKey === snapshot.source.scopeKey && row.link.memberId === member.id) : undefined;
        const allowStats = associated.every((row) => row.link?.allowStats === true);
        const allowRoster = associated.every((row) => row.link?.allowRoster === true);
        const profileSlug = exact?.profileSlug ?? null;
        if (member.identityState === 'resolved' && member.identityId && snapshot.version !== null && allowStats) targets.push({ key, source: snapshot.source, member, version: snapshot.version });
        const row = result.get(key) ?? { key, href: profileSlug ? `/members/${profileSlug}` : `/players/${key}`, displayName: exact?.profileName ?? member.displayName, games: [], profileSlug, activity: [] };
        if (profileSlug && !row.profileSlug) { row.profileSlug = profileSlug; row.href = `/members/${profileSlug}`; row.displayName = exact!.profileName; }
        if (!row.games.includes(game)) row.games.push(game);
        let sessions = statistics && scoped.some((value) => value.statisticsCurrent === true) && isCurrentLogiPeopleSnapshot(statistics, decisionAt) ? statistics.sessions : [];
        if (options.eventId) {
          const event = eventIndex(events).get(options.eventId);
          sessions = event ? sessions.filter((session) => session.eventRefs.some((ref) => eventIndex([event]).has(ref.eventId) && ref.resultVersion === event.result.version && ref.resultState === event.result.state)) : [];
        }
        const stats = allowStats ? summarizePlayerSessions(sessions, member) : null;
        const rosters = allowRoster ? rosterActivity(snapshot, member, events, options.eventId) : [];
        row.activity.push({ game, observedAt: snapshot.observedAt!, statistics: stats, rosters });
        result.set(key, row);
      }
    }
    return { players: [...result.values()].filter((row) => !blocked.has(row.key)).sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '', 'cs') || a.key.localeCompare(b.key)), targets: targets.filter((target) => !blocked.has(target.key)),
      availability: { state: currentSources === enabled.length ? 'complete' : currentSources ? 'partial' : 'unavailable', enabledGames, currentGames: [...currentGames] } };
  } catch { return unavailable(); }
}

/** Availability belongs to the same current snapshot decision as the rows, never an inferred zero. */
export async function readPublicLogiPlayerDirectory(db: Executor, env: LogiIntegrationEnv, options: Options = {}): Promise<PublicPlayerDirectory> {
  const { players, availability } = await readPlayerPublication(db, env, options);
  return { players, availability };
}

export async function readPublicLogiPlayers(db: Executor, env: LogiIntegrationEnv, options: Options = {}): Promise<PublicLogiPlayer[]> {
  return (await readPlayerPublication(db, env, options)).players;
}

/** INTERNAL server-only authority bridge; never serialize source credentials or native identities. */
export async function readPublicLogiPlayerStatisticsTargets(db: Executor, env: LogiIntegrationEnv, playerKey: string, options: Pick<Options, 'now' | 'game'> = {}): Promise<StatisticsTarget[]> {
  if (!/^[a-f0-9]{64}$/.test(playerKey)) return [];
  return (await readPlayerPublication(db, env, options, false)).targets.filter((target) => target.key === playerKey).map(({ source, member, version }) => ({ source, member, version }));
}

/** Bound facts are published only through an already-published same-game match. */
export async function readPublicLogiPlayerMatchPeople(db: Executor, env: LogiIntegrationEnv, game: Game, eventId: string, options: Pick<Options, 'now'> = {}): Promise<PublicPlayerMatchPeople> {
  const players = await readPublicLogiPlayers(db, env, { ...options, game, eventId });
  return { roster: players.flatMap((player) => player.activity.flatMap((activity) => activity.rosters.map((row) => ({ href: player.href, displayName: player.displayName, squad: row.squad, slot: row.slot, reserve: row.reserve })))),
    statistics: players.flatMap((player) => player.activity.flatMap((activity) => activity.statistics ? [{ href: player.href, displayName: player.displayName, statistics: activity.statistics }] : [])) };
}
