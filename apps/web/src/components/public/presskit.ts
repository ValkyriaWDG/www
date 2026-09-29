import type { AppLocale } from '@/i18n/routing';

/*
 * Wardogs January 2026 presskit placements (docs/assets/presskit-2026-01.md). Originals
 * stay unchanged in assets/presskit/; public/presskit/ holds the registered web
 * derivatives from apps/web/scripts/build-presskit-derivatives.mjs. Alt text follows the
 * catalog's localized suggestions (a unit test keeps them in sync). The artwork is
 * illustrative game media: it never stands for a Valkyria event, match or member.
 */

export type PresskitImage = {
  /** Catalog id of the original. */
  id: 'key-art-1080p' | 'flying';
  /** Proportional WebP resizes, narrowest first. */
  sources: { src: string; width: number }[];
  width: number;
  height: number;
  alt: Record<AppLocale, string>;
  /** `contain` keeps a complete composition (key art with its baked-in wordmark). */
  fit: 'contain' | 'cover';
  objectPosition: string;
};

export const PRESSKIT_KEY_ART: PresskitImage = {
  id: 'key-art-1080p',
  sources: [
    { src: '/presskit/key-art-960.webp', width: 960 },
    { src: '/presskit/key-art-1920.webp', width: 1920 },
  ],
  width: 1920,
  height: 1080,
  alt: {
    cs: 'Vojáci a vrtulníky s logem hry Wardogs.',
    en: 'Soldiers and helicopters with the Wardogs game wordmark.',
  },
  fit: 'contain',
  objectPosition: '50% 50%',
};

export const PRESSKIT_FLYING: PresskitImage = {
  id: 'flying',
  sources: [
    { src: '/presskit/flying-800.webp', width: 800 },
    { src: '/presskit/flying-1600.webp', width: 1600 },
  ],
  width: 1600,
  height: 900,
  alt: {
    cs: 'Vrtulník nad zalesněným údolím při západu slunce ve hře Wardogs.',
    en: 'A helicopter above a forested valley at sunset in Wardogs.',
  },
  // The frame keeps the 16:9 original, so nothing is cropped; the position only matters
  // if a layout ever narrows the frame (helicopter sits upper centre-right).
  fit: 'cover',
  objectPosition: '60% 40%',
};

/** Unchanged white Wardogs wordmark for small game identification on dark surfaces. */
export const WARDOGS_MARK = { src: '/presskit/wardogs-fullmark-white.svg', width: 2467, height: 489 } as const;
/** Official Hell Let Loose full mark (assets/brand/game-logos): identification only, never the clan identity. */
export const HLL_MARK = { src: '/brand/hell-let-loose-fullmark-white.svg', width: 424, height: 78 } as const;

export function presskitSrcSet(image: PresskitImage): string {
  return image.sources.map((source) => `${source.src} ${source.width}w`).join(', ');
}
