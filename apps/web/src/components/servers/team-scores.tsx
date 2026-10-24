import { useTranslations } from 'next-intl';
import { formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { PublicServerSnapshot } from '@/modules/integrations/servers/public';
import styles from './servers.module.css';

/** Preserve source team labels and unknown scores; zero is a real score. */
export function TeamScores({ scores, locale }: { scores: NonNullable<PublicServerSnapshot['teamScores']>; locale: AppLocale }) {
  const t = useTranslations('games.servers');
  return (
    <dl className={styles.teamScores} data-team-scores="" aria-label={t('detail.teamScores')}>
      {scores.map((team, index) => (
        <div key={index}>
          <dt>{team.label}</dt>
          <dd>{team.score === null ? <span aria-label={t('notAvailable')}>—</span> : formatNumber(team.score, locale)}</dd>
        </div>
      ))}
    </dl>
  );
}
