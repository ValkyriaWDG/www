import type { PublicArchiveEditorial } from '@/modules/legacy/editorial-details';
import styles from './tournaments.module.css';

/**
 * Restored tournament facts (short description, tag and series) shown as ordinary
 * tournament content. The logo is the tournament emblem; nothing refers to where the
 * record came from.
 */
export function TournamentArchiveFacts({ details, compact = false }: { details: PublicArchiveEditorial; compact?: boolean }) {
  if (details.kind !== 'tournament') return null;
  const series = [details.tag, details.series].filter(Boolean).join(' · ');
  if (!details.excerpt && !series) return null;
  return (
    <div className={compact ? styles.archiveFactsCompact : styles.archiveFacts} data-tournament-archive="">
      {details.excerpt ? <p lang={details.sourceLanguage}>{details.excerpt}</p> : null}
      {series ? <p className={styles.archiveSeries}>{series}</p> : null}
    </div>
  );
}
