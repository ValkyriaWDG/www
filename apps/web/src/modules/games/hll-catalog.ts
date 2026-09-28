import type { Game } from '@valkyria/db/schema';

/**
 * Hell Let Loose match vocabulary shared by the admin editor, validation and public
 * views. Map names are proper names (identical in Czech and English), following the
 * map catalog of CRCON (hll_rcon_tool). Round scores are sectors held (0–5).
 */
export const HLL_MAPS = [
  'Carentan',
  'Driel',
  'El Alamein',
  'Elsenborn Ridge',
  'Foy',
  'Hill 400',
  'Hurtgen Forest',
  'Juno Beach',
  'Kharkov',
  'Kursk',
  'Mortain',
  'Omaha Beach',
  'Purple Heart Lane',
  'Remagen',
  'Smolensk',
  'St. Marie Du Mont',
  'St. Mere Eglise',
  'Stalingrad',
  'Tobruk',
  'Utah Beach',
] as const;

export const HLL_MODES = ['Warfare', 'Offensive', 'Skirmish'] as const;

/** Stored side keys; displayed as localized Allies/Axis. */
export const HLL_SIDES = ['allies', 'axis'] as const;
export type HllSide = (typeof HLL_SIDES)[number];

export const HLL_MAX_SECTOR_SCORE = 5;

export function isHllSide(value: string | null | undefined): value is HllSide {
  return value === 'allies' || value === 'axis';
}

type RoundFields = { side: string | null; scoreValkyria: number | null; scoreOpponent: number | null };

/**
 * Game-specific round checks (field path → error code). HLL rounds take a known side
 * (or none) and sector scores within 0–5; other games keep the generic model.
 */
export function roundIssuesForGame(game: Game, rounds: readonly RoundFields[]): Record<string, 'hll_side' | 'hll_sector_score'> {
  const issues: Record<string, 'hll_side' | 'hll_sector_score'> = {};
  if (game !== 'hell-let-loose') return issues;
  rounds.forEach((round, index) => {
    if (round.side !== null && !isHllSide(round.side)) issues[`rounds.${index}.side`] = 'hll_side';
    for (const field of ['scoreValkyria', 'scoreOpponent'] as const) {
      const score = round[field];
      if (score !== null && score > HLL_MAX_SECTOR_SCORE) issues[`rounds.${index}.${field}`] = 'hll_sector_score';
    }
  });
  return issues;
}
