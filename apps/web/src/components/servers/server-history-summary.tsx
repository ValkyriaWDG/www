import { getTranslations } from 'next-intl/server';
import { FactionShares } from '@/components/public/history-factions';
import { historyBlockedState, historyFiltersFor, historyHref } from '@/components/public/history-query';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice, SectionFrame, StatusBadge, SyntheticNote } from '@/components/ui/panels';
import { formatWeekdayDateTime } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { gamePath } from '@/modules/games/routes';
import { getHistoryGames, getHistoryReport } from '@/modules/integrations/logi/readers/history';
import historyStyles from '@/components/public/history.module.css';
import styles from './servers.module.css';

/**
 * Compact "Game history" summary below the Warcon panel of a selected Wardogs server:
 * games of the last 30 days, the faction win shares as compact bars, the last three games
 * and the link to the full history page of that server. Renders nothing when the server
 * has no approved history source.
 */
export async function ServerHistorySummary({ publicId, serverName, locale }: { publicId: string; serverName: string; locale: AppLocale }) {
  const now = new Date();
  const filters = historyFiltersFor({ period: '30d', map: null, minMinutes: 60 }, now);
  const [report, games] = await Promise.all([getHistoryReport(publicId, filters, now), getHistoryGames(publicId, filters, 1, now)]);
  if (!report || !games) return null;
  const [t, tGames] = await Promise.all([getTranslations({ locale, namespace: 'history.server' }), getTranslations({ locale, namespace: 'history' })]);
  const blocked = historyBlockedState(report.state);
  const href = historyHref(gamePath('wardogs', 'history'), { server: publicId });
  return (
    <div className={styles.warconPanel} data-history-summary={publicId} data-history-state={report.state}>
      <SectionFrame title={t('title')} titleAs="h3" titleId="server-history-title" eyebrow={serverName} description={<p>{t('intro')}</p>}>
        <div className={historyStyles.serverPanel}>
          {report.synthetic ? <SyntheticNote source="history">{tGames('synthetic')}</SyntheticNote> : null}
          {blocked ? (
            <FeedbackNotice kind={blocked === 'preparing' ? 'info' : 'warning'} title={tGames(`state.${blocked}.title`)} live={false}>
              <p>{tGames(`state.${blocked}.body`)}</p>
            </FeedbackNotice>
          ) : (
            <>
              <p className={historyStyles.serverGames} data-history-summary-games={report.games}>{t('games', { count: report.games })}</p>
              {report.games === 0 ? <p className={historyStyles.note}>{t('none')}</p> : (
                <>
                  <p className={historyStyles.serverSubtitle}>{t('factions')}</p>
                  <FactionShares factions={report.factions} outcomes={report.outcomes} locale={locale} compact captionId="server-history-factions-caption" />
                  <p className={historyStyles.serverSubtitle}>{t('recent')}</p>
                  <ul className={historyStyles.serverRecent} data-history-summary-recent="">
                    {games.games.slice(0, 3).map((game) => (
                      <li key={game.id} data-history-summary-game={game.id}>
                        <time dateTime={game.endedAt}>{formatWeekdayDateTime(game.endedAt, locale)}</time>
                        <span>{game.map ?? tGames('games.mapUnknown')}</span>
                        <StatusBadge kind={game.outcome === 'decided' ? 'success' : game.outcome === 'draw' ? 'info' : 'neutral'}>
                          {game.outcome === 'decided' ? tGames('games.outcome.decided', { winner: game.winner ?? '—' }) : tGames(`games.outcome.${game.outcome}`)}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          <p className={historyStyles.serverLink}>
            <GameButton href={href} intent="secondary" data-history-summary-link="">{t('link')}</GameButton>
          </p>
        </div>
      </SectionFrame>
    </div>
  );
}
