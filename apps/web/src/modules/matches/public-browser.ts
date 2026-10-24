import type { Game } from '@valkyria/db';
import { GAME_REGISTRY } from '@/modules/games/registry';
import { canonicalMatchPath } from '@/modules/games/routes';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { logiEventHref, publicLogiMatchRows, publicLogiMatchTime, publicLogiMatchView } from '@/modules/integrations/logi/public-matches';
import type { MatchListView, PublicMatchCounts, PublicMatchPage, PublicMatchSummary } from './types';
import type { LeagueBrowserRow } from './league-browser';

/** Keep N-participant operational results intact instead of forcing them into two teams. */
export type MatchBrowserRow =
  | LeagueBrowserRow
  | { kind: 'archive'; key: string; href: string; at: string; game: Game; match: PublicMatchSummary }
  | { kind: 'logi'; key: string; href: string; at: string; game: Game; event: PublicLogiEvent };

export function archiveBrowserRow(match: PublicMatchSummary): Extract<MatchBrowserRow, { kind: 'archive' }> {
  return { kind: 'archive', key: `archive:${match.game}:${match.slug}`, href: canonicalMatchPath(match.game, match.slug), at: match.startsAt, game: match.game, match };
}

export function logiBrowserRow(event: PublicLogiEvent): Extract<MatchBrowserRow, { kind: 'logi' }> {
  // One configured source per game. React keys may enter Flight output, so no tenant IDs.
  return { kind: 'logi', key: `logi:${event.ref.game}:${encodeURIComponent(event.ref.externalId)}`, href: logiEventHref(event), at: publicLogiMatchTime(event).at, game: GAME_REGISTRY[event.ref.game].db, event };
}

/** At most `operationalCount` operational rows can displace archive rows before a page. */
export function archiveMatchWindow(page: number, pageSize: number, operationalCount: number) {
  const start = (page - 1) * pageSize;
  const offset = Math.max(0, start - operationalCount);
  return { offset, limit: start + pageSize - offset, skip: start - offset };
}

export function mergeMatchBrowserPage(archive: PublicMatchPage, events: readonly PublicLogiEvent[], options: {
  view: MatchListView; game?: Game; q?: string; page: number; pageSize: number; now?: Date;
}, leagueRows: readonly LeagueBrowserRow[] = []) {
  const operational = publicLogiMatchRows(events.filter((event) => !options.game || GAME_REGISTRY[event.ref.game].db === options.game), options);
  const league = leagueRows.filter((row) => !options.game || row.game === options.game);
  const window = archiveMatchWindow(options.page, options.pageSize, operational.length + league.length);
  const direction = options.view === 'results' ? -1 : 1;
  const rows = [...archive.items.map(archiveBrowserRow), ...operational.map(logiBrowserRow), ...league]
    .sort((a, b) => (a.at === null ? b.at === null ? 0 : 1 : b.at === null ? -1 : direction * (Date.parse(a.at) - Date.parse(b.at)))
      // Archive windows already have stable SQL ordering. Preserve it at date ties.
      || (a.kind === 'archive' && b.kind === 'archive' ? 0 : a.key.localeCompare(b.key)));
  const total = archive.total + operational.length + league.length;
  return { items: rows.slice(window.skip, window.skip + options.pageSize), total, page: options.page, pageCount: Math.max(1, Math.ceil(total / options.pageSize)) };
}

export function matchBrowserCounts(archive: PublicMatchCounts, events: readonly PublicLogiEvent[], now = new Date(), leagueCounts = { upcoming: 0, results: 0 }): PublicMatchCounts {
  const counts = { upcoming: archive.upcoming, results: archive.results, byGame: { 'hell-let-loose': { ...archive.byGame['hell-let-loose'] }, wardogs: { ...archive.byGame.wardogs } } };
  for (const event of events) {
    if (event.kind !== 'match') continue;
    const view = publicLogiMatchView(event, now);
    counts[view] += 1;
    counts.byGame[GAME_REGISTRY[event.ref.game].db][view] += 1;
  }
  for (const view of ['upcoming', 'results'] as const) {
    counts[view] += leagueCounts[view];
    counts.byGame.wardogs[view] += leagueCounts[view];
  }
  return counts;
}
