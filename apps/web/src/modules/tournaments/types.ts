import type { ExternalLink, Game, Locale } from '@valkyria/db';
import type { PublicMatchSummary } from '@/modules/matches/types';
import type { LocalizedProse, ProseAdminDetail, ProseStatus } from '@/modules/prose/types';
import type { PublicArchiveEditorial } from '@/modules/legacy/editorial-details';

export type TournamentPublication = 'draft' | 'published';

/** Phase derived from the calendar days in Europe/Prague; `undated` without a start day. */
export type TournamentPhase = 'upcoming' | 'ongoing' | 'finished' | 'undated';

/** Public list row: published shared facts only (no notes, no creator). */
export type PublicTournamentSummary = {
  archiveEditorial?: PublicArchiveEditorial | null;
  slug: string;
  game: Game;
  name: string;
  season: string | null;
  organizer: string | null;
  startsOn: string | null;
  endsOn: string | null;
  phase: TournamentPhase;
  /** Published matches linked to the tournament. */
  matchCount: number;
};

export type PublicTournamentDetail = PublicTournamentSummary & {
  links: ExternalLink[];
  /** Requested locale's published description or explicit absence with source locales. */
  description: LocalizedProse;
  matches: PublicMatchSummary[];
  publishedAt: string;
  updatedAt: string;
};

/** Link of a public match to its published tournament. */
export type PublicTournamentLink = { slug: string; game: Game; name: string; season: string | null };

export type AdminTournamentListItem = {
  id: string;
  slug: string;
  version: number;
  game: Game;
  name: string;
  season: string | null;
  startsOn: string | null;
  endsOn: string | null;
  publication: TournamentPublication;
  publishedAt: string | null;
  matchCount: number;
  description: Record<Locale, ProseStatus>;
  isFixture: boolean;
  updatedAt: string;
};

export type AdminTournamentMatch = {
  id: string;
  slug: string;
  opponentName: string;
  startsAt: string;
  timeZone: string;
  publication: TournamentPublication;
};

export type AdminTournament = AdminTournamentListItem & {
  organizer: string | null;
  links: ExternalLink[];
  /** Private administration text; never part of any public DTO. */
  internalNotes: string;
  descriptionDetail: Record<Locale, ProseAdminDetail>;
  matches: AdminTournamentMatch[];
  createdAt: string;
};

export type AdminTournamentPage = { items: AdminTournamentListItem[]; total: number; page: number; pageCount: number };

/** Tournaments offered by the match editor for one game. */
export type TournamentOption = { id: string; name: string; season: string | null; publication: TournamentPublication };

export type TournamentMutationResult = { id: string; slug: string; version: number; publication: TournamentPublication };
