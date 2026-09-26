/** Reviewed news categories (stable keys, localized labels). The seed invents no tags. */
export const SEED_CATEGORIES = [
  { key: 'announcement', labelCs: 'Oznámení', labelEn: 'Announcement' },
  { key: 'match-report', labelCs: 'Zápasy', labelEn: 'Match report' },
  { key: 'community', labelCs: 'Komunita', labelEn: 'Community' },
  { key: 'update', labelCs: 'Novinky webu', labelEn: 'Site update' },
] as const;

export type SeedCategoryKey = (typeof SEED_CATEGORIES)[number]['key'];
