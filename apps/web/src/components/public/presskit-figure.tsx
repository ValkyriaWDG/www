import type { AppLocale } from '@/i18n/routing';
import { type PresskitImage, presskitSrcSet } from './presskit';
import styles from './pages.module.css';

/**
 * Illustrative presskit image in a quiet 16:9 frame with a localized caption that marks
 * it as game media. Responsive derivatives load lazily with reserved dimensions.
 */
export function PresskitFigure({
  image,
  locale,
  caption,
  sizes = '(min-width: 900px) 820px, 100vw',
}: {
  image: PresskitImage;
  locale: AppLocale;
  caption: string;
  sizes?: string;
}) {
  const largest = image.sources[image.sources.length - 1]!;
  return (
    <figure className={styles.presskitFigure} data-presskit={image.id}>
      <div className={styles.presskitFrame}>
        {/* eslint-disable-next-line @next/next/no-img-element -- committed static derivatives with an explicit srcset */}
        <img
          src={largest.src}
          srcSet={presskitSrcSet(image)}
          sizes={sizes}
          width={image.width}
          height={image.height}
          alt={image.alt[locale]}
          loading="lazy"
          decoding="async"
          style={{ objectFit: image.fit, objectPosition: image.objectPosition }}
        />
      </div>
      <figcaption className={styles.presskitCaption}>{caption}</figcaption>
    </figure>
  );
}
