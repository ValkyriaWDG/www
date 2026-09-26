import type {
  CompetitionType,
  ExternalLink,
  Game,
  Locale,
  MatchOutcome,
  MatchStatus,
  ResultVerification,
} from '@valkyria/db';
import type { PublicImage } from '@/modules/prose/assets';
import type { LocalizedProse, ProseAdminDetail, ProseStatus } from '@/modules/prose/types';

export type MatchPublication = 'draft' | 'published';

/** Result facts. Unknown scores are `null` (never rendered as 0). */
export type PublicMatchResult = {
  scoreValkyria: number | null;
  scoreOpponent: number | null;
  outcome: MatchOutcome;
  verification: ResultVerification;
};

/** Public list row; contains only published shared facts (no notes, no IDs of people). */
export type PublicMatchSummary = {
  slug: string;
  game: Game;
  opponentName: string;
  opponentShortCode: string | null;
  opponentLogo: PublicImage | null;
  competitionType: CompetitionType;
  competitionName: string | null;
  /** UTC instant (ISO 8601). */
  startsAt: string;
  /** Display zone chosen for the fixture (default Europe/Prague). */
  timeZone: string;
  /** Previous start instant when the fixture was postponed. */
  originalStartsAt: string | null;
  status: MatchStatus;
  /** Present only for completed matches with a recorded result. */
  result: PublicMatchResult | null;
};

export type PublicMatchRound = {
  ordinal: number;
  mapName: string | null;
  mode: string | null;
  side: string | null;
  scoreValkyria: number | null;
  scoreOpponent: number | null;
  outcome: MatchOutcome | null;
};

export type PublicMatchCover = PublicImage & { alt: string; caption: string };

export type PublicMatchDetail = PublicMatchSummary & {
  season: string | null;
  format: string | null;
  bestOf: number | null;
  teamSize: number | null;
  eventUrl: string | null;
  vodLinks: ExternalLink[];
  /** Shared cover image; alt/caption from the requested locale's published recap snapshot when it uses the same asset. */
  cover: PublicMatchCover | null;
  rounds: PublicMatchRound[];
  /** Requested locale's published recap or explicit absence with source locales. */
  recap: LocalizedProse;
  publishedAt: string;
  updatedAt: string;
};

export type MatchListView = 'upcoming' | 'results';

export type PublicMatchPage = { items: PublicMatchSummary[]; total: number; page: number; pageCount: number };

export type PublicMatchCounts = {
  upcoming: number;
  results: number;
  byGame: Record<Game, { upcoming: number; results: number }>;
};

export type AdminMatchResult = PublicMatchResult & { source: string; recordedAt: string; updatedAt: string };

export type AdminMatchListItem = {
  id: string;
  slug: string;
  version: number;
  game: Game;
  opponentName: string;
  opponentShortCode: string | null;
  competitionType: CompetitionType;
  competitionName: string | null;
  startsAt: string;
  timeZone: string;
  originalStartsAt: string | null;
  status: MatchStatus;
  publication: MatchPublication;
  publishedAt: string | null;
  result: AdminMatchResult | null;
  recap: Record<Locale, ProseStatus>;
  isFixture: boolean;
  updatedAt: string;
};

export type AdminMatch = AdminMatchListItem & {
  opponentLogoAssetId: string | null;
  season: string | null;
  format: string | null;
  bestOf: number | null;
  teamSize: number | null;
  eventUrl: string | null;
  vodLinks: ExternalLink[];
  coverAssetId: string | null;
  /** Private administration text; never part of any public DTO. */
  internalNotes: string;
  rounds: PublicMatchRound[];
  recapDetail: Record<Locale, ProseAdminDetail>;
  createdAt: string;
};

export type AdminMatchPage = { items: AdminMatchListItem[]; total: number; page: number; pageCount: number };

export type MatchMutationResult = {
  id: string;
  slug: string;
  version: number;
  status: MatchStatus;
  publication: MatchPublication;
};
