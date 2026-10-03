import type {
  CompetitionType,
  ExternalLink,
  Game,
  Locale,
  MatchOutcome,
  MatchStatisticsPlayer,
  MatchStatisticsSource,
  MatchStatisticsTeam,
  MatchStatus,
  ResultVerification,
  StatisticsSide,
} from '@valkyria/db';
import type { PublicImage } from '@/modules/prose/assets';
import type { LocalizedProse, ProseAdminDetail, ProseStatus } from '@/modules/prose/types';
import type { PublicTournamentLink } from '@/modules/tournaments/types';
import type { LegacyMatchDetails } from '@/modules/legacy/match-details';

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
  /** Validated historical public facts only; absent for non-imported matches. */
  legacyDetails?: LegacyMatchDetails | null;
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

/**
 * Imported game statistics of a match. `players` is `null` publicly unless an editor
 * published the player rows; administration always receives them.
 */
export type MatchStatisticsSnapshotView = {
  source: MatchStatisticsSource;
  sourceLabel: string;
  externalGameId: string | null;
  /** Stable configured source identifier and validated public game link; absent for uploads. */
  sourceServerPublicId: string | null;
  sourceGameUrl: string | null;
  mapName: string | null;
  mode: string | null;
  gameStartedAt: string | null;
  gameEndedAt: string | null;
  result: { allied: number; axis: number } | null;
  valkyriaSide: StatisticsSide | null;
  teams: Record<StatisticsSide, MatchStatisticsTeam>;
  players: MatchStatisticsPlayer[] | null;
  playerCount: number;
  publishPlayers: boolean;
  observedAt: string;
};

export type MatchStatisticsView = MatchStatisticsSnapshotView & {
  /** Additional historical rounds; the primary snapshot above is round 1. */
  rounds?: { ordinal: number; statistics: MatchStatisticsSnapshotView }[];
};

export type PublicMatchDetail = PublicMatchSummary & {
  season: string | null;
  format: string | null;
  bestOf: number | null;
  teamSize: number | null;
  eventUrl: string | null;
  /** Canonical Wardogs League detail link read as an unverified preview (Wardogs only). */
  leagueMatchUrl: string | null;
  vodLinks: ExternalLink[];
  /** Shared cover image; alt/caption from the requested locale's published recap snapshot when it uses the same asset. */
  cover: PublicMatchCover | null;
  rounds: PublicMatchRound[];
  statistics: MatchStatisticsView | null;
  /** Requested locale's published recap or explicit absence with source locales. */
  recap: LocalizedProse;
  /** Published tournament the match belongs to (hidden while the tournament is a draft). */
  tournament: PublicTournamentLink | null;
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
  tournamentId: string | null;
  season: string | null;
  format: string | null;
  bestOf: number | null;
  teamSize: number | null;
  eventUrl: string | null;
  leagueMatchUrl: string | null;
  vodLinks: ExternalLink[];
  coverAssetId: string | null;
  /** Private administration text; never part of any public DTO. */
  internalNotes: string;
  rounds: PublicMatchRound[];
  statistics: MatchStatisticsView | null;
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
