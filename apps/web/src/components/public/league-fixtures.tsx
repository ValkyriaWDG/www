import { getTranslations } from 'next-intl/server';
import { SectionFrame, StatusBadge, type StatusKind, SyntheticNote } from '@/components/ui/panels';
import { formatDate, formatNumber } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { canonicalMatchPath } from '@/modules/games/routes';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';
import type { LeagueFixturePublic, LeagueFixturesPublic } from '@/modules/integrations/logi/readers/public';
import { mapPublishedLeagueMatchSlugs } from '@/modules/matches/queries';
import { ExternalLink } from './external-link';
import { leagueValueKey, type LeagueValueGroup } from './league-labels';
import { logiEventHref } from './logi-matches';
import styles from './matches.module.css';

const ITEM_KIND: Record<LeagueFixturePublic['state'], StatusKind> = { fresh: 'success', stale: 'warning' };

/**
 * Unverified overview of the Wardogs League fixtures Logi tracks for the clan, after the
 * Upcoming list of the Wardogs matches page: kickoff, teams, map and League type/status
 * per fixture with its observation time and freshness, a League link, the clan's own
 * match page when a published match carries the same League link and the Logi roster
 * page when the fixture is bound to a published Logi event. Never a result: results are
 * published by the clan only. Unavailable or empty lists render one quiet line.
 */
export async function LeagueFixtures({ fixtures, locale }: { fixtures: LeagueFixturesPublic; locale: AppLocale }) {
  const [t, tLeague, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: 'matches.list.leagueFixtures' }),
    getTranslations({ locale, namespace: 'matches.detail.league' }),
    getTranslations({ locale, namespace: 'common.external' }),
  ]);
  const external = tCommon('suffix');
  const items = fixtures.items;
  const [detailSlugs, logiEvents] = items.length > 0
    ? await Promise.all([
      mapPublishedLeagueMatchSlugs(getDb(), items.map((item) => item.id)).catch(() => new Map<string, string>()),
      getPublicLogiEvents('wardogs'),
    ])
    : [new Map<string, string>(), []];
  const logiHrefs = new Map(logiEvents.map((event) => [event.ref.externalId, logiEventHref(event)]));
  // Known League enumerations get localized labels; anything else is shown as published.
  const label = (group: LeagueValueGroup, raw: string | null): string | null => {
    const key = leagueValueKey(group, raw);
    return key ? tLeague(key as Parameters<typeof tLeague>[0]) : raw;
  };
  const dash = <span aria-hidden="true">—</span>;
  const mapLine = (map: LeagueFixturePublic['map']) => (map ? [map.name, map.zone, map.lighting].filter((part): part is string => Boolean(part)).join(' · ') : '');

  let body;
  if (fixtures.state === 'unavailable') {
    body = (
      <p className={styles.leagueUnavailable}>
        <StatusBadge kind="neutral">{t('unavailable')}</StatusBadge>
      </p>
    );
  } else if (items.length === 0) {
    body = <p className={styles.leagueUnavailable} data-league-fixtures-empty="">{t('empty')}</p>;
  } else {
    body = (
      <ul className={styles.leagueFixtureList} data-league-fixture-list="">
        {items.map((item) => {
          const titleId = `league-fixture-${item.id}`;
          const slug = detailSlugs.get(item.id);
          const logiHref = item.eventId ? logiHrefs.get(item.eventId) : undefined;
          return (
            <li key={item.id} data-league-fixture={item.id} data-league-state={item.state} data-league-tracking={item.tracking}>
              <article className={styles.leagueFixture} aria-labelledby={titleId}>
                <h3 id={titleId} className={styles.leagueTitle}>
                  {item.fixtureNumber !== null ? t('fixture', { number: formatNumber(item.fixtureNumber, locale) }) : item.title}
                </h3>
                {item.fixtureNumber !== null ? <p className={styles.leagueFixtureName}>{item.title}</p> : null}
                <dl className={styles.leagueFacts}>
                  <div className={styles.leagueWide}>
                    <dt>{t('scheduled')}</dt>
                    <dd>{item.scheduledAt ? <time dateTime={item.scheduledAt}>{formatDate(item.scheduledAt, locale, 'dateTimeZone')}</time> : t('unscheduled')}</dd>
                  </div>
                  <div className={styles.leagueWide}>
                    <dt>{t('teams')}</dt>
                    <dd>
                      {item.teams.length > 0 ? (
                        <ul className={styles.leagueTeams} data-league-teams="">
                          {item.teams.map((team) => (
                            <li key={team.code}>
                              <span className={styles.leagueTeamCode}>{team.code}</span>
                              {team.name ? <span>{team.name}</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : dash}
                    </dd>
                  </div>
                  <div className={styles.leagueWide}>
                    <dt>{t('map')}</dt>
                    <dd>{mapLine(item.map) || dash}</dd>
                  </div>
                  <div>
                    <dt>{t('type')}</dt>
                    <dd>{label('type', item.type) ?? dash}</dd>
                  </div>
                  <div>
                    <dt>{t('status')}</dt>
                    <dd>{label('status', item.status) ?? dash}</dd>
                  </div>
                  {item.hosting && (item.hosting.mode || item.hosting.teamCode) ? (
                    <div>
                      <dt>{t('hosting')}</dt>
                      <dd>{item.hosting.mode && item.hosting.teamCode ? t('hostingValue', { mode: label('hosting', item.hosting.mode) ?? item.hosting.mode, team: item.hosting.teamCode }) : (label('hosting', item.hosting.mode) ?? item.hosting.teamCode)}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className={styles.leagueMeta}>
                  <StatusBadge kind={ITEM_KIND[item.state]}>{t(`freshness.${item.state}`)}</StatusBadge>
                  {item.tracking !== 'tracked' ? <StatusBadge kind="neutral" icon={false}>{t(`tracking.${item.tracking}`)}</StatusBadge> : null}
                  <time dateTime={item.observedAt}>{t('observed', { time: formatDate(item.observedAt, locale, 'dateTimeZone') })}</time>
                </p>
                <ul className={`${styles.links} ${styles.leagueFixtureLinks}`} aria-label={t('links.label')} data-league-links="">
                  <li>
                    <ExternalLink href={item.sourceUrl} externalLabel={external}>
                      {t('links.source')}
                    </ExternalLink>
                  </li>
                  {slug ? (
                    <li>
                      <Link href={canonicalMatchPath('wardogs', slug)} className={styles.leagueFixtureLink} data-league-link="detail">
                        {t('links.detail')}
                      </Link>
                    </li>
                  ) : null}
                  {logiHref ? (
                    <li>
                      <Link href={logiHref} className={styles.leagueFixtureLink} data-league-link="logi">
                        {t('links.logi')}
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </article>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={styles.leagueFixtures} data-league-fixtures="" data-league-fixtures-state={fixtures.state}>
      <SectionFrame title={t('title')} titleAs="h2" titleId="league-fixtures-title" description={<p className={styles.leagueNote}>{t('note')}</p>}>
        {fixtures.synthetic ? <SyntheticNote source="league-fixtures">{t('synthetic')}</SyntheticNote> : null}
        {body}
        {fixtures.state === 'stale' && items.length > 0 ? <p className={styles.leagueNote}>{t('stale')}</p> : null}
        {fixtures.truncated ? <p className={styles.leagueNote} data-league-fixtures-truncated="">{t('truncated')}</p> : null}
      </SectionFrame>
    </div>
  );
}
