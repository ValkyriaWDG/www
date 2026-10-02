import type { Game } from '@valkyria/db';

export type LogiPeopleState = 'unconfigured' | 'fresh' | 'stale' | 'unavailable';
export type LogiMemberType = 'member' | 'reserve_member' | 'mercenary';
export type LogiMemberStatus = 'pending' | 'recruit' | 'active';

/** Totals describe only the identified source sessions, never a player's career. */
export type PlayerStatisticsSummary = {
  sessions: number;
  completeSessions: number;
  firstStartedAt: string | null;
  lastEndedAt: string | null;
  metrics: { key: string; value: number | null; sessionsWithValue: number }[];
};

/** Only authorized editorial linking receives immutable source identity references. */
export type LogiMemberCandidate = {
  scopeKey: string;
  sourceInstanceId: string;
  guildId: string;
  gameId: 'hell_let_loose' | 'wardogs';
  memberId: string;
  identityId: string;
  displayName: string | null;
  type: LogiMemberType;
  status: LogiMemberStatus;
};

export type LogiTeamMember = {
  memberId: string;
  displayName: string | null;
  type: LogiMemberType;
  status: LogiMemberStatus;
  paused: boolean;
  identityState: 'resolved' | 'unresolved' | 'conflict';
  groups: string[];
  statistics: PlayerStatisticsSummary | null;
};

export type LogiTeamRosterSlot = {
  memberId: string | null;
  displayName: string | null;
  index: number;
  attendance: string | null;
};

export type LogiTeamRoster = {
  id: string;
  eventId: string;
  updatedAt: string | null;
  squads: { index: number; name: string; slots: LogiTeamRosterSlot[] }[];
  reserves: LogiTeamRosterSlot[];
};

export type LogiTeamAttendance = {
  eventId: string;
  memberId: string;
  displayName: string | null;
  status: string;
  completed: 'passed' | 'failed' | null;
};

export type LogiTeamView = {
  state: LogiPeopleState;
  observedAt: string | null;
  members: LogiTeamMember[];
  rosters: LogiTeamRoster[];
  attendance: LogiTeamAttendance[];
};

/** Public names and slugs always come from a consented website profile. */
export type PublicRosterEntry = {
  eventId: string;
  profileSlug: string;
  displayName: string;
  squad: string | null;
  slot: number | null;
  reserve: boolean;
};

export type PublicLogiMemberEnrichment = {
  game: Game;
  observedAt: string;
  statistics: PlayerStatisticsSummary | null;
  rosters: PublicRosterEntry[];
};

export type PublicLogiEventPeople = {
  observedAt: string;
  roster: PublicRosterEntry[];
  statistics: { profileSlug: string; displayName: string; statistics: PlayerStatisticsSummary }[];
};
