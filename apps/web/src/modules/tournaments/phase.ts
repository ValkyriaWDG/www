import type { TournamentPhase } from './types';

/** Phase of a tournament on `today` (`YYYY-MM-DD` in Europe/Prague); days are inclusive. */
export function tournamentPhase(startsOn: string | null, endsOn: string | null, today: string): TournamentPhase {
  if (!startsOn) return 'undated';
  if (today < startsOn) return 'upcoming';
  if (endsOn && today > endsOn) return 'finished';
  return 'ongoing';
}
