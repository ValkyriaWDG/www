import { TrophyIcon } from '@/components/ui/icons';
import { mediaUrl } from '@/modules/content/rich-text/render';
import type { PublicTournamentSummary } from '@/modules/tournaments/types';
import styles from './tournaments.module.css';

/** The competition's own logo when the archive restored one, otherwise the trophy glyph. */
export function TournamentEmblem({ item, size, ...props }: { item: Pick<PublicTournamentSummary, 'archiveEditorial'>; size: number } & Record<`data-${string}`, string>) {
  const logo = item.archiveEditorial?.logo;
  return (
    <span className={styles.cardEmblem} aria-hidden="true" data-emblem={logo ? 'logo' : 'trophy'} {...props}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- publication-aware media delivery; decorative beside the title
        <img src={mediaUrl(logo.assetId, 'thumb')} alt="" width={logo.width} height={logo.height} loading="lazy" decoding="async" />
      ) : (
        <TrophyIcon size={size} />
      )}
    </span>
  );
}
