import type { ReactNode } from 'react';
import { parseExternalHttpsUrl } from '@/components/shell/external-links';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { LegacyMatchDetails } from '@/modules/legacy/match-details';
import { ExternalLink } from './external-link';
import { MatchCountry } from './match-country';
import type { MatchT } from './match-parts';
import styles from './matches.module.css';

/** Well-known recording platforms keep their brand spelling; other source types stay verbatim. */
const SOURCE_TYPE_NAMES: Record<string, string> = { youtube: 'YouTube', twitch: 'Twitch', facebook: 'Facebook', discord: 'Discord', vimeo: 'Vimeo', kick: 'Kick' };
export const sourceTypeName = (type: string) => SOURCE_TYPE_NAMES[type.trim().toLowerCase()] ?? type;

/** Imported recording dates are `DD/MM/YYYY` (or ISO) text; other values stay verbatim. */
export function recordingDate(value: string, locale: AppLocale): string {
  const text = value.trim();
  const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)?.slice(1).reverse() ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)?.slice(1);
  if (!parts) return value;
  const [year, month, day] = parts.map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return value;
  return formatDate(date, locale, 'date', 'UTC');
}

/**
 * Recorded match facts (teams with countries and sides, capture point, points, duration,
 * first capture, recordings), readable in both locales independent of recap translation.
 * Conflicting duplicate values and raw source timestamps stay stored, not shown.
 */
export function MatchLegacyDetails({ details, locale, t, titleId, externalLabel }: {
  details: LegacyMatchDetails;
  locale: AppLocale;
  t: MatchT;
  titleId: string;
  externalLabel: string;
}) {
  const facts: { key: string; label: string; value: ReactNode }[] = [
    {
      key: 'home', label: t('legacy.homeTeam'),
      value: <><span>{details.homeTeamName}</span><MatchCountry code={details.homeCountry} t={t} showName />{details.homeSide || details.homeSideLabel ? <span>{details.homeSide ? t(`detail.sides.${details.homeSide}`) : details.homeSideLabel}</span> : null}</>,
    },
    {
      key: 'away', label: t('legacy.awayTeam'),
      value: <><span>{details.awayTeamName}</span><MatchCountry code={details.awayCountry} t={t} showName />{details.awaySide || details.awaySideLabel ? <span>{details.awaySide ? t(`detail.sides.${details.awaySide}`) : details.awaySideLabel}</span> : null}</>,
    },
  ];
  if (details.capturePoint) facts.push({ key: 'capturePoint', label: t('legacy.capturePoint'), value: details.capturePoint });
  if (details.points.length) facts.push({ key: 'points', label: t('legacy.points'), value: details.points.join(' : ') });
  if (details.durationMinutes !== null) facts.push({ key: 'duration', label: t('legacy.duration'), value: t('legacy.minutes', { count: details.durationMinutes }) });
  if (details.firstCapture) facts.push({ key: 'firstCapture', label: t('legacy.firstCapture'), value: t(`detail.sides.${details.firstCapture}`) });
  const sourceLinks = details.sourceLinks.flatMap((link) => {
    const url = parseExternalHttpsUrl(link.url);
    return url ? [{ ...link, url }] : [];
  });

  return (
    <section className={styles.block} aria-labelledby={`${titleId}-legacy`} data-match-legacy="">
      <h3 id={`${titleId}-legacy`} className={styles.blockTitle}>{t('legacy.title')}</h3>
      <dl className={styles.legacyFacts}>
        {facts.map((fact) => <div key={fact.key} data-legacy-fact={fact.key}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
      </dl>
      {sourceLinks.length ? (
        <div data-legacy-source-links="">
          <h4 className={styles.statsSubtitle}>{t('legacy.sourceLinks')}</h4>
          <ul className={styles.legacySourceLinks}>
            {sourceLinks.map((link, index) => <li key={`${link.url}-${index}`}>
              <ExternalLink href={link.url} externalLabel={externalLabel}>{link.title?.trim() ? link.title : t('legacy.sourceLink', { number: index + 1 })}</ExternalLink>
              {link.description ? <p>{link.description}</p> : null}
              {link.author || link.date || link.type ? <dl className={styles.legacyFacts}>
                {link.author ? <div><dt>{t('legacy.linkAuthor')}</dt><dd>{link.author}</dd></div> : null}
                {link.date ? <div><dt>{t('legacy.linkDate')}</dt><dd>{recordingDate(link.date, locale)}</dd></div> : null}
                {link.type ? <div><dt>{t('legacy.linkType')}</dt><dd>{sourceTypeName(link.type)}</dd></div> : null}
              </dl> : null}
            </li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
