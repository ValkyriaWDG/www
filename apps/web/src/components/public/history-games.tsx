import { getTranslations } from 'next-intl/server';
import { Pagination } from '@/components/ui/pagination';
import { SectionFrame, StatusBadge, type StatusKind } from '@/components/ui/panels';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { formatNumber, formatWeekdayDateTime } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { HistoryGamePlayerPublic, HistoryGamePublic, HistoryGamesPublic } from '@/modules/integrations/logi/readers/history-public';
import { FactionSwatch } from './history-factions';
import { formatPlaytime, historyHref, type HistoryQuery } from './history-query';
import matchStyles from './matches.module.css';
import styles from './history.module.css';

const OUTCOME_KIND: Record<HistoryGamePublic['outcome'], StatusKind> = { decided: 'success', draw: 'info', no_result: 'neutral', unknown: 'neutral' };
const PLAYER_METRICS = ['seconds', 'kills', 'deaths', 'cashDelta', 'headshots', 'teamKills', 'suicides', 'vehicleKills'] as const;

function Dash({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">{label}</span>
    </>
  );
}

/**
 * Paginated list of completed games, newest first: end time, map · mode · lighting,
 * final scores with the factions' colour chips, an outcome badge that always carries
 * text and a badge for a game without a combat feed. A native `<details>` opens the
 * game's players grouped by faction (result, playtime, kills, deaths, cash delta and the
 * feed-only metrics) when the source publishes players, else the faction scores only.
 */
export async function GameHistoryList({ games, locale, query, base }: { games: HistoryGamesPublic; locale: AppLocale; query: HistoryQuery; base: string }) {
  const [t, tPlayers, tA11y] = await Promise.all([
    getTranslations({ locale, namespace: 'history.games' }),
    getTranslations({ locale, namespace: 'history.players' }),
    getTranslations({ locale, namespace: 'common.a11y' }),
  ]);
  const number = (value: number) => formatNumber(value, locale);
  const unknown = tPlayers('unknownValue');
  const pageCount = Math.max(1, Math.ceil(games.total / games.pageSize));
  const from = games.games.length === 0 ? 0 : (games.page - 1) * games.pageSize + 1;
  const to = games.games.length === 0 ? 0 : from + games.games.length - 1;

  const metric = (player: HistoryGamePlayerPublic, key: (typeof PLAYER_METRICS)[number]) => {
    const value = player[key];
    if (value === null) return <Dash label={unknown} />;
    if (key === 'seconds') return formatPlaytime(value) ?? <Dash label={unknown} />;
    if (key === 'cashDelta') return formatNumber(value, locale, { signDisplay: 'exceptZero' });
    return number(value);
  };

  /** Players grouped by faction in the game's faction order, factions only named by players after them, then players without a faction. */
  const playerGroups = (game: HistoryGamePublic): { name: string | null; colorHex: string | null; players: HistoryGamePlayerPublic[] }[] => {
    const players = game.players ?? [];
    const names = [...game.factions.map((faction) => faction.name), ...players.map((player) => player.faction).filter((name): name is string => name !== null)];
    const groups = [...new Set(names)].map((name) => ({ name: name as string | null, colorHex: game.factions.find((faction) => faction.name === name)?.colorHex ?? null, players: players.filter((player) => player.faction === name) }));
    groups.push({ name: null, colorHex: null, players: players.filter((player) => player.faction === null) });
    return groups.filter((group) => group.players.length > 0);
  };

  const scores = (game: HistoryGamePublic) => (
    <ul className={styles.scores} data-history-scores="" aria-label={t('scores')}>
      {game.factions.map((faction) => (
        <li key={faction.name}>
          <FactionSwatch colorHex={faction.colorHex} />
          <span className={styles.scoreName}>{faction.name}</span>
          <span className={styles.scoreValue}>{faction.score === null ? <Dash label={t('scoreUnknown')} /> : number(faction.score)}</span>
        </li>
      ))}
    </ul>
  );

  const detail = (game: HistoryGamePublic) => {
    if (game.players === null) {
      return (
        <details className={styles.details} data-history-game-detail="scores">
          <summary>{t('factionScores')}</summary>
          <div className={styles.detailBody}>{scores(game)}</div>
        </details>
      );
    }
    const groups = playerGroups(game);
    return (
      <details className={styles.details} data-history-game-detail="players">
        <summary>{t('players', { count: number(game.players.length) })}</summary>
        <div className={styles.detailBody}>
          {groups.length === 0 ? <p className={styles.note}>{t('noPlayers')}</p> : null}
          {groups.map((group) => {
            // Unique per open game: the scroll regions of several opened games are labelled landmarks.
            const caption = `${formatWeekdayDateTime(game.endedAt, locale)} · ${group.name ?? t('noFaction')} – ${t('players', { count: number(group.players.length) })}`;
            return (
              <div key={group.name ?? '-'} className={styles.factionGroup} data-history-game-faction={group.name ?? ''}>
                <h3 className={styles.factionGroupTitle}>
                  <FactionSwatch colorHex={group.colorHex} />
                  {group.name ?? t('noFaction')}
                </h3>
                <ScrollRegion label={tA11y('scrollRegion', { label: caption })} className={matchStyles.rounds} data-sticky-column="">
                  <table>
                    <caption className="visually-hidden">{caption}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('columns.player')}</th>
                        <th scope="col">{t('columns.result')}</th>
                        <th scope="col">{t('columns.playtime')}</th>
                        <th scope="col">{t('columns.kills')}</th>
                        <th scope="col">{t('columns.deaths')}</th>
                        <th scope="col">{t('columns.cashDelta')}</th>
                        <th scope="col">{t('columns.headshots')}</th>
                        <th scope="col">{t('columns.teamKills')}</th>
                        <th scope="col">{t('columns.suicides')}</th>
                        <th scope="col">{t('columns.vehicleKills')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.players.map((player) => (
                        <tr key={player.key} data-history-game-player={player.key}>
                          <th scope="row">
                            <span className={styles.playerCell}>
                              <span className={styles.playerName}>{player.name ?? tPlayers('unknownPlayer')}</span>
                              <span className={styles.platform}>{tPlayers(`platform.${player.platform}`)}</span>
                            </span>
                          </th>
                          <td>{t(`result.${player.result ?? 'unknown'}`)}</td>
                          {PLAYER_METRICS.map((key) => (
                            <td key={key} data-numeric="">{metric(player, key)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollRegion>
              </div>
            );
          })}
        </div>
      </details>
    );
  };

  return (
    <div className={styles.section} data-history-games="">
      <SectionFrame title={t('title')} titleAs="h2" titleId="history-games-title" description={<p className={styles.note}>{t('description')}</p>}>
        {games.games.length === 0 ? (
          <p className={styles.note} data-history-games-empty="page">
            {t('pageEmpty')}{' '}
            <Link href={historyHref(base, query, { page: 1 })} className={styles.footLink}>{t('firstPage')}</Link>
          </p>
        ) : (
          <>
            <p className={styles.count} data-history-games-count="">{t('count', { from: number(from), to: number(to), total: games.total })}</p>
            <ol className={styles.games} data-history-game-list="">
              {games.games.map((game) => {
                const mapLine = [game.map ?? t('mapUnknown'), game.mode, game.lighting].filter((part): part is string => Boolean(part)).join(' · ');
                return (
                  <li key={game.id} className={styles.game} data-history-game={game.id} data-history-outcome={game.outcome}>
                    <div className={styles.gameHead}>
                      <time dateTime={game.endedAt}>{t('ended', { time: formatWeekdayDateTime(game.endedAt, locale) })}</time>
                      <span className={styles.gameMap}>{mapLine}</span>
                      <span className={styles.gameBadges}>
                        <StatusBadge kind={OUTCOME_KIND[game.outcome]}>{game.outcome === 'decided' ? t('outcome.decided', { winner: game.winner ?? '—' }) : t(`outcome.${game.outcome}`)}</StatusBadge>
                        {game.hasFeed ? null : <StatusBadge kind="warning" icon={false}>{t('noFeed')}</StatusBadge>}
                      </span>
                    </div>
                    {scores(game)}
                    {detail(game)}
                  </li>
                );
              })}
            </ol>
            <Pagination page={games.page} pageCount={pageCount} hrefForPage={(page) => historyHref(base, query, { page })} />
          </>
        )}
      </SectionFrame>
    </div>
  );
}
