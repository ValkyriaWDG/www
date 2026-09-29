import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { MapScene } from '@/components/hll/map-artwork';
import { parseExternalHttpsUrl } from '@/components/shell/external-links';
import { GameButton } from '@/components/ui/game-button';
import { DetailPane } from '@/components/ui/panels';
import { formatDate, formatNumber } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { mediaUrl } from '@/modules/content/rich-text/render';
import { isHllSide } from '@/modules/games/hll-catalog';
import { hllMapArtwork, type HllMapArtwork } from '@/modules/games/hll-maps';
import { canonicalMatchPath, canonicalTournamentPath } from '@/modules/games/routes';
import type { PublicMatchDetail } from '@/modules/matches/types';
import { ExternalLink } from './external-link';
import { LocalizedProseView } from './localized-prose';
import { matchFormatLabel } from './match-format';
import { getMatchTranslations, MatchBanner, MatchResult, MatchStatusBadge, OpponentMark } from './match-parts';
import { MatchStatistics } from './match-statistics';
import emblem from '../../../public/brand/valkyria-emblem-733.webp';
import styles from './matches.module.css';

/** Map pack artwork for HLL rounds with a recognised map, in round order, each map once. */
function matchMaps(match: PublicMatchDetail): { artwork: HllMapArtwork; name: string }[] {
  const maps: { artwork: HllMapArtwork; name: string }[] = [];
  if (match.game !== 'hell-let-loose') return maps;
  for (const round of match.rounds) {
    const artwork = hllMapArtwork(round.mapName);
    if (artwork && round.mapName && !maps.some((entry) => entry.artwork.slug === artwork.slug)) maps.push({ artwork, name: round.mapName });
  }
  return maps;
}

/**
 * Match detail after reference 13's right pane. Order: opponent/event → game/date/status →
 * result (+ provisional/verified) → recap → VOD/event links. `preview` is the compact
 * desktop preview beside the list with a MATCH DETAILS action; `detail` is the overview of
 * the canonical `/matches/<slug>` page, whose maps/rounds and statistics follow in
 * `MatchDetailExtras` at full width.
 */
export async function MatchDetailPane({
  match,
  locale,
  mode,
  detailHref,
  titleId,
}: {
  match: PublicMatchDetail;
  locale: AppLocale;
  mode: 'preview' | 'detail';
  detailHref?: string;
  titleId: string;
}) {
  const t = await getMatchTranslations(locale);
  const external = (await getTranslations({ locale, namespace: 'common.external' }))('suffix');
  const competition = [t(`competition.${match.competitionType}`), match.competitionName].filter(Boolean).join(' – ');
  const format = matchFormatLabel(match.format, match.bestOf, (count) => t('detail.bestOf', { count }));

  const metadata = [
    { label: t('detail.competition'), value: competition },
    ...(match.tournament
      ? [
          {
            label: t('tournaments.matchTournament'),
            value: (
              <Link href={canonicalTournamentPath(match.tournament.game, match.tournament.slug)} data-match-tournament={match.tournament.slug}>
                {[match.tournament.name, match.tournament.season].filter(Boolean).join(' · ')}
              </Link>
            ),
          },
        ]
      : []),
    {
      label: t('detail.start'),
      value: (
        <time dateTime={match.startsAt} data-match-start="">
          {formatDate(match.startsAt, locale, 'dateTimeZone')}
        </time>
      ),
    },
    ...(match.status === 'postponed' && match.originalStartsAt
      ? [
          {
            label: t('detail.originalStart'),
            value: (
              <time dateTime={match.originalStartsAt} data-original-start="">
                {formatDate(match.originalStartsAt, locale, 'dateTimeZone')}
              </time>
            ),
          },
        ]
      : []),
    { label: t('detail.status'), value: <MatchStatusBadge match={match} t={t} /> },
    { label: t('detail.game'), value: t(`games.${match.game}`) },
    ...(match.season ? [{ label: t('detail.season'), value: match.season }] : []),
    ...(format ? [{ label: t('detail.format'), value: format }] : []),
    ...(match.teamSize ? [{ label: t('detail.teamSize'), value: formatNumber(match.teamSize, locale) }] : []),
  ];

  const eventUrl = parseExternalHttpsUrl(match.eventUrl);
  const vods = match.vodLinks.map((link) => ({ url: parseExternalHttpsUrl(link.url), label: link.label })).filter((link): link is { url: string; label: string } => Boolean(link.url));
  // A published cover always wins; otherwise the first recognised HLL map is the banner scene.
  const scene = match.cover ? undefined : matchMaps(match)[0]?.artwork.scene.src;

  const media = match.cover ? (
    <figure className={styles.coverFigure}>
      {/* eslint-disable-next-line @next/next/no-img-element -- publication-aware media route, not the optimizer */}
      <img src={mediaUrl(match.cover.assetId, 'full')} alt={match.cover.alt} width={match.cover.width} height={match.cover.height} decoding="async" />
      {mode === 'detail' && match.cover.caption ? <figcaption>{match.cover.caption}</figcaption> : null}
    </figure>
  ) : (
    <MatchBanner match={match} t={t} scene={scene} />
  );

  return (
    <div data-match-detail={match.slug} data-detail-mode={mode}>
      <DetailPane
        titleId={titleId}
        eyebrow={`${t(`games.${match.game}`)} // ${t(`competition.${match.competitionType}`)}`}
        title={mode === 'detail' ? t('detail.overview') : t('meta.detailTitle', { opponent: match.opponentName })}
        media={media}
        metadata={metadata}
        actions={
          mode === 'preview' && detailHref ? (
            <GameButton href={detailHref} intent="primary" size="lg" fullWidth data-match-detail-link="">
              {t('detail.openDetail')}
            </GameButton>
          ) : undefined
        }
      >
        <section className={styles.block} aria-labelledby={`${titleId}-result`}>
          <h3 id={`${titleId}-result`} className={styles.blockTitle}>
            {t('detail.result')}
          </h3>
          <MatchResult match={match} t={t} variant="detail" />
        </section>
        {mode === 'detail' ? (
          <>
            <section className={styles.block} aria-labelledby={`${titleId}-recap`} data-match-recap="">
              <h3 id={`${titleId}-recap`} className={styles.blockTitle}>
                {t('detail.recap')}
              </h3>
              <LocalizedProseView
                prose={match.recap}
                locale={locale}
                path={canonicalMatchPath(match.game, match.slug)}
                labels={{
                  missingTitle: t('detail.recapMissingTitle'),
                  missingBody: t('detail.recapMissingBody'),
                  none: t('detail.recapNone'),
                  other: { cs: t('detail.recapOther.cs'), en: t('detail.recapOther.en') },
                }}
              />
            </section>
            {eventUrl || vods.length > 0 ? (
              <section className={styles.block} aria-labelledby={`${titleId}-links`} data-match-links="">
                <h3 id={`${titleId}-links`} className={styles.blockTitle}>
                  {t('detail.links')}
                </h3>
                <ul className={styles.links}>
                  {eventUrl ? (
                    <li>
                      <ExternalLink href={eventUrl} externalLabel={external}>
                        {t('detail.event')}
                      </ExternalLink>
                    </li>
                  ) : null}
                  {vods.map((vod) => (
                    <li key={vod.url}>
                      <ExternalLink href={vod.url} externalLabel={external}>
                        {vod.label}
                      </ExternalLink>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </DetailPane>
    </div>
  );
}

/**
 * Maps/rounds and imported statistics of the canonical detail. They need more width than
 * the one-third pane, so the browser lays them out below the list and pane at full width
 * (and below the overview on narrower screens).
 */
export async function MatchDetailExtras({ match, locale, titleId }: { match: PublicMatchDetail; locale: AppLocale; titleId: string }) {
  if (match.rounds.length === 0 && !match.statistics) return null;
  const t = await getMatchTranslations(locale);
  const maps = matchMaps(match);
  const showRoundColumn = {
    map: match.rounds.some((round) => round.mapName),
    mode: match.rounds.some((round) => round.mode),
    side: match.rounds.some((round) => round.side),
  };
  return (
    <div className={styles.extras} data-match-extras={match.slug}>
      {match.rounds.length > 0 ? (
        <section className={styles.block} aria-labelledby={`${titleId}-rounds`} data-match-rounds="">
          <h3 id={`${titleId}-rounds`} className={styles.blockTitle}>
            {t('detail.rounds')}
          </h3>
          {maps.length > 0 ? (
            <ul className={styles.mapBriefing} data-match-maps="">
              {maps.map(({ artwork, name }) => (
                <li key={artwork.slug}>
                  <MapScene
                    artwork={artwork}
                    caption={name}
                    alt={t('detail.mapImageAlt', { map: name })}
                    tacticalLabel={t('detail.tacticalMap', { map: name, size: formatNumber(Math.round(artwork.tactical.bytes / 1024), locale) })}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <div className={styles.rounds} role="region" aria-labelledby={`${titleId}-rounds`} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('detail.roundColumns.ordinal')}</th>
                  {showRoundColumn.map ? <th scope="col">{t('detail.roundColumns.map')}</th> : null}
                  {showRoundColumn.mode ? <th scope="col">{t('detail.roundColumns.mode')}</th> : null}
                  {showRoundColumn.side ? <th scope="col">{t('detail.roundColumns.side')}</th> : null}
                  <th scope="col">{t('detail.roundColumns.score')}</th>
                  <th scope="col">{t('detail.roundColumns.outcome')}</th>
                </tr>
              </thead>
              <tbody>
                {match.rounds.map((round) => {
                  const score = round.scoreValkyria !== null && round.scoreOpponent !== null ? `${round.scoreValkyria} : ${round.scoreOpponent}` : null;
                  return (
                    <tr key={round.ordinal}>
                      <td data-numeric="">{round.ordinal}</td>
                      {showRoundColumn.map ? <td>{round.mapName ?? '—'}</td> : null}
                      {showRoundColumn.mode ? <td>{round.mode ?? '—'}</td> : null}
                      {showRoundColumn.side ? <td>{isHllSide(round.side) ? t(`detail.sides.${round.side}`) : (round.side ?? '—')}</td> : null}
                      <td data-numeric="">
                        {score ?? (
                          <>
                            <span aria-hidden="true">—</span>
                            <span className="visually-hidden">{t('result.unknown')}</span>
                          </>
                        )}
                      </td>
                      <td>{round.outcome && round.outcome !== 'unknown' ? t(`outcome.${round.outcome}`) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {match.statistics ? (
        <MatchStatistics
          statistics={match.statistics}
          locale={locale}
          titleId={titleId}
          opponentLabel={match.opponentShortCode ?? match.opponentName}
          marks={{
            valkyria: <Image src={emblem} alt="" className={styles.teamMark} sizes="24px" data-team-mark="valkyria" />,
            opponent: <OpponentMark match={match} className={styles.teamMark} />,
          }}
        />
      ) : null}
    </div>
  );
}
