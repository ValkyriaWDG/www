import { getTranslations } from 'next-intl/server';
import { EmptyState, FeedbackNotice, SectionFrame, StatusBadge } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { gameRouteFromDb } from '@/modules/games/registry';
import type {
  LogiTeamView,
  PlayerStatisticsSummary,
  PublicLogiEventPeople,
  PublicLogiMemberEnrichment,
} from '@/modules/integrations/logi-people-types';
import styles from './logi-people.module.css';

const metricKeys = [
  'kills',
  'deaths',
  'combat',
  'offense',
  'defense',
  'support',
  'seconds',
  'cashDelta',
  'headshots',
  'teamKills',
  'suicides',
  'vehicleKills',
  'longestM',
  'killStreak',
  'deathStreak',
] as const;
const responses = [
  'pending',
  'acknowledged',
  'confirmed',
  'attending',
  'not_attending',
  'accepted',
  'declined',
  'tentative',
  'registered',
  'passed',
  'failed',
] as const;
const date = (value: string, locale: AppLocale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(value));

export async function LogiPlayerStatistics({ locale, stats }: { locale: AppLocale; stats: PlayerStatisticsSummary }) {
  const t = await getTranslations({ locale, namespace: 'logiPeople' });
  return (
    <div className={styles.stack} data-logi-player-stats="">
      <p>{t('statsCoverage', { sessions: stats.sessions, complete: stats.completeSessions })}</p>
      <p className={styles.muted}>
        {t('period', {
          from: stats.firstStartedAt ? date(stats.firstStartedAt, locale) : t('unknown'),
          to: stats.lastEndedAt ? date(stats.lastEndedAt, locale) : t('unknown'),
        })}
      </p>
      <dl className={styles.metrics}>
        {metricKeys.map((key) => {
          const metric = stats.metrics.find((row) => row.key === key);
          return (
            <div key={key}>
              <dt>{t(`metrics.${key}`)}</dt>
              <dd>
                {metric?.value === null || metric?.value === undefined ? '—' : new Intl.NumberFormat(locale).format(metric.value)}
                <small>{t('metricCoverage', { count: metric?.sessionsWithValue ?? 0 })}</small>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className={styles.muted}>{t('statsNote')}</p>
    </div>
  );
}

export async function LogiTeamScreen({
  locale,
  view,
  eventTitles = {},
}: {
  locale: AppLocale;
  view: LogiTeamView;
  eventTitles?: Record<string, string>;
}) {
  const t = await getTranslations({ locale, namespace: 'logiPeople' });
  const response = (value: string | null) => {
    const key = responses.find((key) => key === value);
    return key ? t(key) : t('unknown');
  };
  return (
    <div className={styles.stack} data-logi-team={view.state}>
      <FeedbackNotice kind={view.state === 'fresh' ? 'info' : 'warning'} live={false}>
        {t(view.state)}
        {view.observedAt ? (
          <p>
            <time dateTime={view.observedAt}>{t('updated', { date: date(view.observedAt, locale) })}</time>
          </p>
        ) : null}
      </FeedbackNotice>
      <SectionFrame title={t('members')} titleId="team-members">
        {view.members.length ? (
          <div className={styles.scroll} role="region" aria-label={t('members')} tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('name')}</th>
                  <th scope="col">{t('membership')}</th>
                  <th scope="col">{t('groups')}</th>
                  <th scope="col">{t('statistics')}</th>
                </tr>
              </thead>
              <tbody>
                {view.members.map((member) => (
                  <tr key={member.memberId}>
                    <th scope="row">{member.displayName ?? t('unknown')}</th>
                    <td>
                      {t(member.type)} · {t(member.status)}
                      {member.paused ? (
                        <p>
                          <StatusBadge kind="warning">{t('paused')}</StatusBadge>
                        </p>
                      ) : null}
                    </td>
                    <td>{member.groups.join(', ') || '—'}</td>
                    <td>
                      {member.statistics ? (
                        t('statsCoverage', { sessions: member.statistics.sessions, complete: member.statistics.completeSessions })
                      ) : (
                        t('unknown')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t('empty')} />
        )}
        {view.members.flatMap((member) => member.statistics ? [
          <details key={member.memberId} className={styles.statistics}>
            <summary className={styles.summary}>{member.displayName ?? t('unknown')} · {t('statistics')}</summary>
            <LogiPlayerStatistics locale={locale} stats={member.statistics} />
          </details>,
        ] : [])}
      </SectionFrame>
      <SectionFrame title={t('rosters')} titleId="team-rosters">
        <div className={styles.stack}>
          {view.rosters.length ? (
            view.rosters.map((roster, index) => (
              <article key={roster.id} data-logi-roster="">
                <h3>{eventTitles[roster.eventId] ?? t('rosterTitle', { number: index + 1 })}</h3>
                {roster.updatedAt ? <p className={styles.muted}>{t('updated', { date: date(roster.updatedAt, locale) })}</p> : null}
                {[...roster.squads, { index: -1, name: t('reserves'), slots: roster.reserves }]
                  .filter((squad) => squad.slots.length)
                  .map((squad) => (
                    <section key={squad.index}>
                      <h4>{squad.name}</h4>
                      <ol>
                        {squad.slots.map((slot) => (
                          <li key={slot.index}>
                            {slot.displayName ?? t('vacant')} · {response(slot.attendance)}
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
              </article>
            ))
          ) : (
            <EmptyState title={t('empty')} />
          )}
        </div>
      </SectionFrame>
      <SectionFrame title={t('attendance')} titleId="team-attendance" description={t('attendanceNote')}>
        {view.attendance.length ? (
          <div className={styles.scroll} role="region" aria-label={t('attendance')} tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('name')}</th>
                  <th scope="col">{t('match')}</th>
                  <th scope="col">{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {view.attendance.map((row, index) => (
                  <tr key={`${row.eventId}:${row.memberId}:${index}`}>
                    <th scope="row">{row.displayName ?? t('unknown')}</th>
                    <td>
                      {eventTitles[row.eventId] ??
                        t('rosterTitle', { number: view.rosters.findIndex((r) => r.eventId === row.eventId) + 1 })}
                    </td>
                    <td>
                      {response(row.status)}
                      {row.completed ? ` · ${response(row.completed)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t('empty')} />
        )}
      </SectionFrame>
    </div>
  );
}

export async function PublicLogiMemberActivity({ locale, items }: { locale: AppLocale; items: PublicLogiMemberEnrichment[] }) {
  if (!items.length) return null;
  const t = await getTranslations({ locale, namespace: 'logiPeople' });
  return (
    <SectionFrame title={t('publicTitle')} titleId="member-logi-activity" description={t('publicNotice')}>
      <div className={styles.stack}>
        {items.map((item) => (
          <section key={item.game}>
            <h3>{item.game === 'wardogs' ? 'Wardogs' : 'Hell Let Loose'}</h3>
            <p className={styles.muted}>
              {t('updated', { date: date(item.observedAt, locale) })} · {t('source')}
            </p>
            {item.statistics ? <LogiPlayerStatistics locale={locale} stats={item.statistics} /> : null}
            {item.rosters.length ? (
              <>
                <h4>{t('publicRoster')}</h4>
                <ul>
                  {item.rosters.map((row, index) => (
                    <li key={`${row.eventId}:${index}`}>
                      <Link href={`/${gameRouteFromDb(item.game)}/matches/logi/${encodeURIComponent(row.eventId)}`}>
                        {t('match')} {index + 1}
                      </Link>{' '}
                      · {row.reserve ? t('reserves') : (row.squad ?? t('unknown'))}
                      {row.slot === null ? '' : ` · ${t('position')} ${row.slot + 1}`}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ))}
      </div>
    </SectionFrame>
  );
}

export async function PublicLogiMatchPeople({ locale, people }: { locale: AppLocale; people: PublicLogiEventPeople | null }) {
  if (!people || (!people.roster.length && !people.statistics.length)) return null;
  const t = await getTranslations({ locale, namespace: 'logiPeople' });
  return (
    <SectionFrame title={t('publicRoster')} titleId="match-logi-people" description={t('publicNotice')}>
      <div className={styles.stack}>
        <ul>
          {people.roster.map((row, index) => (
            <li key={`${row.profileSlug}:${index}`}>
              <Link href={`/members/${row.profileSlug}`}>{row.displayName}</Link> ·{' '}
              {row.reserve ? t('reserves') : (row.squad ?? t('unknown'))}
              {row.slot === null ? '' : ` · ${t('position')} ${row.slot + 1}`}
            </li>
          ))}
        </ul>
        {people.statistics.map((row) => (
          <section key={row.profileSlug}>
            <h3>
              <Link href={`/members/${row.profileSlug}`}>{row.displayName}</Link>
            </h3>
            <LogiPlayerStatistics locale={locale} stats={row.statistics} />
          </section>
        ))}
      </div>
    </SectionFrame>
  );
}
