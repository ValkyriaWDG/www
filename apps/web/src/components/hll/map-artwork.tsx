import type { HllMapArtwork } from '@/modules/games/hll-maps';
import styles from './map-artwork.module.css';

/**
 * Map pack artwork (docs/assets/graphics-pack-2026-09-29.md). Images illustrate a map
 * that the page already names in text; they never carry live state, scores or players.
 * The tactical map is a plain link, so its bytes load only when a visitor opens it.
 */

/** Decorative list thumbnail: the map name is the adjacent text. */
export function MapThumb({ artwork, className }: { artwork: HllMapArtwork; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- prepared static derivative (images are unoptimized)
    <img
      className={className}
      src={artwork.thumb.src}
      width={artwork.thumb.width}
      height={artwork.thumb.height}
      alt=""
      loading="lazy"
      decoding="async"
      data-map-thumb={artwork.slug}
    />
  );
}

export function MapScene({
  artwork,
  alt,
  tacticalLabel,
  caption,
  priority = false,
  wide = false,
}: {
  artwork: HllMapArtwork;
  /** Localized context, e.g. "Carentan — in-game scene of the map". */
  alt: string;
  tacticalLabel: string;
  caption?: string;
  priority?: boolean;
  /** 3:1 crop of the text-free scene where vertical space matters (server detail). */
  wide?: boolean;
}) {
  return (
    <figure className={styles.scene} data-map-scene={artwork.slug} data-wide={wide ? '' : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- prepared static derivative (images are unoptimized) */}
      <img
        src={artwork.scene.src}
        width={artwork.scene.width}
        height={artwork.scene.height}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
      <figcaption className={styles.caption}>
        {caption ? <span className={styles.name}>{caption}</span> : null}
        <a className={styles.tactical} href={artwork.tactical.src} data-map-tactical={artwork.slug}>
          {tacticalLabel}
        </a>
      </figcaption>
    </figure>
  );
}
