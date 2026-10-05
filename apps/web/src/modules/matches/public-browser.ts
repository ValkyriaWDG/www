import type { Game } from '@valkyria/db/schema';
import { GAME_REGISTRY } from '@/modules/games/registry';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { publicLogiMatchTime } from '@/modules/integrations/logi/public-matches';
import type { MatchListView, PublicMatchSummary } from './types';

/** Storage origins are implementation details, not separate public collections. */
export type PublicMatchRow = { kind: 'website'; match: PublicMatchSummary } | { kind: 'connected'; event: PublicLogiEvent };
export type UnifiedPublicMatchPage = { items: PublicMatchRow[]; total: number; page: number; pageCount: number };

export function publicMatchRowGame(row: PublicMatchRow): Game {
  return row.kind === 'website' ? row.match.game : GAME_REGISTRY[row.event.ref.game].db;
}

export function publicMatchRowSlug(row: PublicMatchRow): string | undefined {
  return row.kind === 'website' ? row.match.slug : row.event.archive?.slug;
}

export function publicMatchRowKey(row: PublicMatchRow): string {
  return row.kind === 'website' ? `website:${row.match.slug}` : `connected:${row.event.ref.game}:${row.event.ref.externalId}`;
}

/** At most L connected rows can shift a website row's global offset by L. */
export function publicMatchWindow(page: number, pageSize: number, connectedCount: number) {
  const offset = (page - 1) * pageSize;
  const websiteOffset = Math.max(0, offset - connectedCount);
  return { websiteOffset, websiteLimit: pageSize + connectedCount, skip: offset - websiteOffset };
}

/** Website rows retain their database tie order; connected rows retain their stable identity order. */
export function mergePublicMatchWindow(website: PublicMatchSummary[], connected: PublicLogiEvent[], view: MatchListView, skip: number, pageSize: number): PublicMatchRow[] {
  const rows: PublicMatchRow[] = [...website.map((match): PublicMatchRow => ({ kind: 'website', match })), ...connected.map((event): PublicMatchRow => ({ kind: 'connected', event }))];
  const time = (row: PublicMatchRow) => Date.parse(row.kind === 'website' ? row.match.startsAt : publicLogiMatchTime(row.event).at);
  const direction = view === 'results' ? -1 : 1;
  rows.sort((left, right) => direction * (time(left) - time(right)) || (left.kind === right.kind ? 0 : left.kind === 'website' ? -1 : 1));
  return rows.slice(skip, skip + pageSize);
}
