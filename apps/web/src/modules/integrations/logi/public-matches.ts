import type { PublicLogiEvent } from './mapping';

export type PublicLogiMatchView = 'upcoming' | 'results';
export const PUBLIC_LOGI_MATCH_PAGE_SIZE = 10;
/** Matches the local fixture browser's grace for a match that just started. */
const NEXT_MATCH_GRACE_MS = 3 * 60 * 60_000;

/** An end time stays an end time; an old event does not acquire a fictional start. */
export function publicLogiMatchTime(event: PublicLogiEvent): { at: string; kind: 'start' | 'end' } {
  return event.startsAt ? { at: event.startsAt, kind: 'start' } : { at: event.result.endedAt ?? event.endsAt, kind: 'end' };
}

/** List placement is separate from the producer's nullable operational status. */
export function publicLogiMatchView(event: PublicLogiEvent, now = new Date()): PublicLogiMatchView {
  return event.status === 'concluded' || event.result.state !== 'unknown' || Date.parse(event.endsAt) <= now.getTime() ? 'results' : 'upcoming';
}

export function logiEventHref(event: PublicLogiEvent): string {
  return `/${event.ref.game}/matches/logi/${encodeURIComponent(event.ref.externalId)}`;
}

function identity(event: PublicLogiEvent): string {
  return JSON.stringify([event.ref.sourceInstanceId, event.ref.guildId, event.ref.game, event.ref.externalId]);
}

const folded = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** One filter/order/page rule for rows, counts and next-match callers. Input is already publication-scoped. */
export function queryPublicLogiMatches(events: readonly PublicLogiEvent[], options: {
  view: PublicLogiMatchView;
  q?: string;
  page?: number;
  pageSize?: number;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  const page = Number.isSafeInteger(options.page) && options.page! >= 1 && options.page! <= 1000 ? options.page! : 1;
  const pageSize = Number.isSafeInteger(options.pageSize) && options.pageSize! >= 1 && options.pageSize! <= 100 ? options.pageSize! : PUBLIC_LOGI_MATCH_PAGE_SIZE;
  const search = folded(options.q?.trim() ?? '');
  const direction = options.view === 'results' ? -1 : 1;
  const rows = events.filter((event) => event.kind === 'match' && publicLogiMatchView(event, now) === options.view && (!search || folded([
    event.title,
    event.archive?.opponentName ?? '', event.archive?.opponentShortCode ?? '', event.archive?.competitionName ?? '',
    ...event.teams.flatMap((team) => [team.name, team.shortCode ?? '', team.side ?? '']),
    ...event.result.participants.map((participant) => participant.label),
  ].join(' ')).includes(search))).sort((left, right) => direction * (Date.parse(publicLogiMatchTime(left).at) - Date.parse(publicLogiMatchTime(right).at)) || identity(left).localeCompare(identity(right)));
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageCount: Math.max(1, Math.ceil(rows.length / pageSize)) };
}

/** A homepage teaser requires a supplied start; the list can still display an unknown-start fixture. */
export function getNextPublicLogiMatch(events: readonly PublicLogiEvent[], now = new Date()): PublicLogiEvent | null {
  const eligible = events.filter((event) => event.startsAt !== null && (event.status === 'starting' || Date.parse(event.startsAt) >= now.getTime() - NEXT_MATCH_GRACE_MS));
  return queryPublicLogiMatches(eligible, { view: 'upcoming', now, pageSize: 1 }).items[0] ?? null;
}
