/** Reviewed news categories (stable keys, localized labels). The seed invents no tags. */
export const SEED_CATEGORIES = [
  { key: 'announcement', labelCs: 'Oznámení', labelEn: 'Announcement' },
  { key: 'match-report', labelCs: 'Zápasy', labelEn: 'Match report' },
  { key: 'community', labelCs: 'Komunita', labelEn: 'Community' },
  { key: 'update', labelCs: 'Novinky webu', labelEn: 'Site update' },
] as const;

export type SeedCategoryKey = (typeof SEED_CATEGORIES)[number]['key'];

/**
 * Reviewed HLL field manual categories (stable keys, editorial order). The public manual
 * shows a category only once it has a published article, so empty ones stay hidden.
 */
export const SEED_MANUAL_CATEGORIES = [
  {
    game: 'hell-let-loose',
    key: 'getting-started',
    sortOrder: 10,
    labelCs: 'Začínáme',
    labelEn: 'Getting started',
    descriptionCs: 'Nastavení hry, ovládání a herní režimy.',
    descriptionEn: 'Game settings, controls and game modes.',
  },
  {
    game: 'hell-let-loose',
    key: 'communication',
    sortOrder: 20,
    labelCs: 'Komunikace',
    labelEn: 'Communication',
    descriptionCs: 'Hlasové kanály, hlášení a spolupráce v jednotce.',
    descriptionEn: 'Voice channels, callouts and squad teamwork.',
  },
  {
    game: 'hell-let-loose',
    key: 'roles',
    sortOrder: 30,
    labelCs: 'Role',
    labelEn: 'Roles',
    descriptionCs: 'Úkoly a vybavení jednotlivých rolí.',
    descriptionEn: 'Duties and loadouts of each role.',
  },
  {
    game: 'hell-let-loose',
    key: 'leadership',
    sortOrder: 40,
    labelCs: 'Velení',
    labelEn: 'Leadership',
    descriptionCs: 'Velitel družstva, velitel a koordinace postupu.',
    descriptionEn: 'Squad leader, commander and coordinating the advance.',
  },
  {
    game: 'hell-let-loose',
    key: 'vehicles',
    sortOrder: 50,
    labelCs: 'Vozidla a tanky',
    labelEn: 'Vehicles and armour',
    descriptionCs: 'Posádky, obrněnci a logistika.',
    descriptionEn: 'Crews, armour and logistics.',
  },
  {
    game: 'hell-let-loose',
    key: 'spawns',
    sortOrder: 60,
    labelCs: 'Spawny a zásobování',
    labelEn: 'Spawns and supplies',
    descriptionCs: 'Garrisony, outposty a zásoby.',
    descriptionEn: 'Garrisons, outposts and supplies.',
  },
] as const;
