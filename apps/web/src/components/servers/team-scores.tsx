import { useTranslations } from 'next-intl';
import { formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { ServerSnapshot } from '@/modules/integrations/contract';
import styles from './servers.module.css';

/** Preserve source team labels and unknown scores; zero is a real score. */
export function TeamScores({ scores, locale }: { scores: NonNullable<ServerSnapshot['teamScores']>; locale: AppLocale }) {
  const t = useTranslations('games.servers');
  return (
    <dl className={styles.teamScores} data-team-scores="" aria-label={t('detail.teamScores')}>
      {scores.map((team) => (
        <div key={team.id}>
          <dt>{team.label}</dt>
          <dd>{team.score === null ? <span aria-label={t('notAvailable')}>—</span> : formatNumber(team.score, locale)}</dd>
        </div>
      ))}
    </dl>
  );
}
