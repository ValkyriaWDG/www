import type { GameRoute } from '@/modules/games/registry';

/** Decorative game imagery only; no image is evidence of a clan event or a live map state. */
export type HllArtwork = Readonly<{ src: string; width: number; height: number; objectPosition: string }>;

const categoryArtwork: Readonly<Record<string, { file: string; objectPosition: string }>> = {
  'getting-started': { file: 'getting-started', objectPosition: '50% 60%' },
  'objectives-and-modes': { file: 'objectives-and-modes', objectPosition: '50% 50%' },
  'roles-and-equipment': { file: 'roles-and-equipment', objectPosition: '30% 43%' },
  communication: { file: 'communication', objectPosition: '31% 51%' },
  'logistics-and-vehicles': { file: 'logistics-and-vehicles', objectPosition: '50% 50%' },
  'armor-and-artillery': { file: 'armor-and-artillery', objectPosition: '66% 48%' },
  'spawns-and-engineering': { file: 'spawns-and-engineering', objectPosition: '50% 60%' },
  'squad-leader-fieldcraft': { file: 'squad-leader-fieldcraft', objectPosition: '50% 50%' },
};

// The current CMS seeds six categories. Preserve their published URLs and labels.
const categoryAliases: Readonly<Record<string, string>> = {
  roles: 'roles-and-equipment',
  vehicles: 'logistics-and-vehicles',
  spawns: 'spawns-and-engineering',
  leadership: 'squad-leader-fieldcraft',
};

export const HLL_NEWS_ARTWORK: HllArtwork = {
  src: '/images/hll/news.webp', width: 1280, height: 720, objectPosition: '50% 50%',
};

/** Unknown CMS categories stay text-only; never construct an asset URL from user input. */
export function getHllManualArtwork(game: GameRoute, key: string | undefined): HllArtwork | null {
  if (game !== 'hll' || !key) return null;
  const canonical = Object.hasOwn(categoryAliases, key) ? categoryAliases[key]! : key;
  if (!Object.hasOwn(categoryArtwork, canonical)) return null;
  const image = categoryArtwork[canonical]!;
  return { src: `/images/hll/${image.file}.webp`, width: 1280, height: 720, objectPosition: image.objectPosition };
}
