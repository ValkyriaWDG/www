import { mediaUrl } from '@/modules/content/rich-text/render';
import type { PublicImage } from '@/modules/prose/assets';
import { initialsOf } from './member-format';
import styles from './members.module.css';

/**
 * Approved avatar or an initials fallback in a box of reserved size (no layout shift, no
 * broken image). Decorative: the display name is always rendered next to it.
 */
export function MemberAvatar({ avatar, name, size }: { avatar: PublicImage | null; name: string; size: 'sm' | 'lg' }) {
  return (
    <span className={styles.avatar} data-size={size} data-avatar={avatar ? 'image' : 'initials'} aria-hidden="true">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- publication-aware media route, not the optimizer
        <img src={mediaUrl(avatar.assetId, size === 'lg' ? 'full' : 'thumb')} alt="" width={avatar.width} height={avatar.height} loading="lazy" decoding="async" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
