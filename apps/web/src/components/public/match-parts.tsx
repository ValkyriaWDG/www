import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { mediaUrl } from '@/modules/content/rich-text/render';
import type { PublicMatchSummary } from '@/modules/matches/types';
import emblem from '../../../public/brand/valkyria-emblem-733.webp';
import { describeResult, formatScore, outcomeKind, statusKind, zoneName } from './match-format';
import styles from './matches.module.css';

export const getMatchTranslations = (locale: AppLocale) => getTranslations({ locale, namespace: 'matches' });
export type MatchT = Awaited<ReturnType<typeof getMatchTranslations>>;

/** Start date and time in Europe/Prague with the explicit zone; postponed rows show the original date. */
export function MatchStart({ match, locale, t }: { match: PublicMatchSummary; locale: AppLocale; t: MatchT }) {
  return (
    <span className={styles.startCell}>
      <time dateTime={match.startsAt} className={styles.start}>
        <span className={styles.startDate}>{formatDate(match.startsAt, locale, 'dateShort')}</span>
        <span className={styles.startTime}>
          {formatDate(match.startsAt, locale, 'time')} {zoneName(match.startsAt, locale)}
        </span>
      </time>
      {match.status === 'postponed' && match.originalStartsAt ? (
        <span className={styles.original} data-original-start="">
          {t('row.originally', { date: formatDate(match.originalStartsAt, locale, 'dateShort') })}
        </span>
      ) : null}
    </span>
  );
}

/** Opponent logo (decorative, name adjacent) or its short code in a reserved square. */
export function OpponentMark({ match, className }: { match: PublicMatchSummary; className?: string }) {
  return (
    <span className={className ?? styles.logo} aria-hidden="true">
      {match.opponentLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- publication-aware media route, not the optimizer
        <img src={mediaUrl(match.opponentLogo.assetId, 'thumb')} alt="" width={match.opponentLogo.width} height={match.opponentLogo.height} loading="lazy" decoding="async" />
      ) : (
        (match.opponentShortCode ?? match.opponentName.slice(0, 3)).toUpperCase()
      )}
    </span>
  );
}

/** "VALKYRIA vs Opponent" with the opponent mark. */
export function MatchTeams({ match, t }: { match: PublicMatchSummary; t: MatchT }) {
  return (
    <span className={styles.matchName}>
      <OpponentMark match={match} />
      <span className={styles.teams}>
        <span className={styles.us}>{t('row.valkyria')}</span>
        <span className={styles.vs}>{t('row.versus')}</span>
        <span data-opponent="">{match.opponentName}</span>
      </span>
    </span>
  );
}

export function MatchStatusBadge({ match, t }: { match: PublicMatchSummary; t: MatchT }) {
  return (
    <span data-match-status={match.status}>
      <StatusBadge kind={statusKind(match.status)}>{t(`status.${match.status}`)}</StatusBadge>
    </span>
  );
}

/**
 * Published result. Known scores use tabular numerals plus the outcome; an unknown score is
 * a dash with an accessible explanation (visible in the detail), never `0 : 0`.
 */
export function MatchResult({ match, t, variant }: { match: PublicMatchSummary; t: MatchT; variant: 'row' | 'detail' }) {
  const result = describeResult(match);
  if (result.kind === 'score' || result.kind === 'outcome') {
    const score = result.kind === 'score' ? formatScore(result.valkyria, result.opponent) : null;
    return (
      <span className={variant === 'row' ? styles.result : styles.resultLine} data-result={result.kind}>
        {score && result.kind === 'score' ? (
          <>
            <span className={variant === 'row' ? styles.score : styles.bigScore} aria-hidden="true">
              {score}
            </span>
            <span className="visually-hidden">{t('result.scoreLabel', { valkyria: result.valkyria, opponent: result.opponent })}</span>
          </>
        ) : null}
        {result.outcome !== 'unknown' ? <StatusBadge kind={outcomeKind(result.outcome)}>{t(`outcome.${result.outcome}`)}</StatusBadge> : null}
        {variant === 'detail' ? <StatusBadge kind={result.verification === 'verified' ? 'success' : 'warning'}>{t(`verification.${result.verification}`)}</StatusBadge> : null}
      </span>
    );
  }
  const text = result.kind === 'unpublished' ? t('result.unknown') : result.kind === 'cancelled' ? t('result.cancelled') : t('result.pending');
  if (variant === 'detail') {
    return (
      <span className={styles.resultLine} data-result={result.kind}>
        <span className={styles.bigScore} aria-hidden="true">
          —
        </span>
        <span className={styles.resultText}>{text}</span>
      </span>
    );
  }
  return (
    <span className={styles.result} data-result={result.kind}>
      <span className={styles.dash} aria-hidden="true">
        —
      </span>
      <span className="visually-hidden">{text}</span>
    </span>
  );
}

/** Decorative versus banner when no approved match cover exists (never a broken image). */
export function MatchBanner({ match, t }: { match: PublicMatchSummary; t: MatchT }) {
  return (
    <div className={styles.banner} aria-hidden="true" data-match-banner="">
      <span className={styles.bannerSide}>
        <Image src={emblem} alt="" sizes="88px" />
        <span className={styles.bannerName}>{t('row.valkyria')}</span>
      </span>
      <span className={styles.bannerVs}>VS</span>
      <span className={styles.bannerSide}>
        <OpponentMark match={match} className={styles.bannerLogo} />
        <span className={styles.bannerName}>{match.opponentShortCode ?? match.opponentName}</span>
      </span>
    </div>
  );
}
