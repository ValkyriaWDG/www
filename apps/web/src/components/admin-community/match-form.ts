import type { CompetitionType, Game, MatchOutcome, MatchStatus, ResultVerification } from '@valkyria/db/schema';
import { roundIssuesForGame } from '@/modules/games/hll-catalog';
import { isLeagueMatchUrl, LEAGUE_MATCH_URL_MAX_LENGTH } from '@/modules/integrations/logi/readers/league-url';
import { DEFAULT_MATCH_TIME_ZONE, isValidTimeZone, ZonedTimeError, zonedLocalDateTime, zonedLocalToInstant } from '@/modules/matches/time';
import type { AdminMatch } from '@/modules/matches/types';
import type { FieldErrors } from './errors';
import type { MediaRef } from './media-field';

export type RoundValues = {
  key: string;
  mapName: string;
  mode: string;
  side: string;
  scoreValkyria: string;
  scoreOpponent: string;
  outcome: '' | MatchOutcome;
};

export const MAX_ROUND_ROWS = 50;

let roundSequence = 0;
export function newRoundKey(): string {
  roundSequence += 1;
  return `round-${roundSequence}`;
}

export function emptyRound(): RoundValues {
  return { key: newRoundKey(), mapName: '', mode: '', side: '', scoreValkyria: '', scoreOpponent: '', outcome: '' };
}

/*
 * Pure conversions between the admin match record and the editor's string-based form
 * values, plus client-side checks that mirror (never replace) the server rules.
 */

export type VodLinkValues = { key: string; label: string; url: string };

export type FactsValues = {
  game: Game;
  opponentName: string;
  opponentShortCode: string;
  opponentLogo: MediaRef | null;
  competitionType: CompetitionType;
  competitionName: string;
  /** Linked tournament id of the same game, or '' for none. */
  tournamentId: string;
  season: string;
  format: string;
  bestOf: string;
  teamSize: string;
  eventUrl: string;
  /** Wardogs League detail link (Wardogs matches only); shown publicly as an unverified preview. */
  leagueMatchUrl: string;
  vodLinks: VodLinkValues[];
  cover: MediaRef | null;
  internalNotes: string;
  /** Create only: optional custom slug (generated when empty). */
  slug: string;
};

export type ScheduleValues = { date: string; time: string; timeZone: string };

export type ResultValues = {
  scoreValkyria: string;
  scoreOpponent: string;
  outcome: '' | MatchOutcome;
  verification: ResultVerification;
  source: string;
};

export const MAX_VOD_ROWS = 5;

/** Explicit zone choices; the stored zone of a match is always offered too. */
export const TIME_ZONE_CHOICES = ['Europe/Prague', 'Europe/Bratislava', 'Europe/Berlin', 'Europe/Warsaw', 'Europe/London', 'UTC', 'America/New_York'] as const;

/** A result or live state may be recorded from one hour before the start (server rule). */
export const RESULT_EARLY_WINDOW_MS = 60 * 60 * 1000;

let vodSequence = 0;
export function newVodKey(): string {
  vodSequence += 1;
  return `vod-${vodSequence}`;
}

const text = (value: string | null | undefined) => value ?? '';
const numberText = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));

export function emptyFacts(): FactsValues {
  return {
    game: 'wardogs',
    opponentName: '',
    opponentShortCode: '',
    opponentLogo: null,
    competitionType: 'friendly',
    competitionName: '',
    tournamentId: '',
    season: '',
    format: '',
    bestOf: '',
    teamSize: '',
    eventUrl: '',
    leagueMatchUrl: '',
    vodLinks: [],
    cover: null,
    internalNotes: '',
    slug: '',
  };
}

export function factsFrom(match: AdminMatch): FactsValues {
  return {
    game: match.game,
    opponentName: match.opponentName,
    opponentShortCode: text(match.opponentShortCode),
    opponentLogo: match.opponentLogoAssetId ? { assetId: match.opponentLogoAssetId, filename: null } : null,
    competitionType: match.competitionType,
    competitionName: text(match.competitionName),
    tournamentId: text(match.tournamentId),
    season: text(match.season),
    format: text(match.format),
    bestOf: numberText(match.bestOf),
    teamSize: numberText(match.teamSize),
    eventUrl: text(match.eventUrl),
    leagueMatchUrl: text(match.leagueMatchUrl),
    vodLinks: match.vodLinks.map((link) => ({ key: newVodKey(), label: link.label, url: link.url })),
    cover: match.coverAssetId ? { assetId: match.coverAssetId, filename: null } : null,
    internalNotes: match.internalNotes,
    slug: match.slug,
  };
}

export function emptySchedule(): ScheduleValues {
  return { date: '', time: '', timeZone: DEFAULT_MATCH_TIME_ZONE };
}

export function scheduleFrom(match: Pick<AdminMatch, 'startsAt' | 'timeZone'>): ScheduleValues {
  const zone = isValidTimeZone(match.timeZone) ? match.timeZone : DEFAULT_MATCH_TIME_ZONE;
  const local = zonedLocalDateTime(new Date(match.startsAt), zone);
  const [date = '', time = ''] = local.split('T');
  return { date, time, timeZone: zone };
}

export function resultFrom(match: AdminMatch | null): ResultValues {
  const result = match?.result;
  if (!result) return { scoreValkyria: '', scoreOpponent: '', outcome: '', verification: 'provisional', source: '' };
  const known = result.scoreValkyria !== null && result.scoreOpponent !== null;
  return {
    scoreValkyria: numberText(result.scoreValkyria),
    scoreOpponent: numberText(result.scoreOpponent),
    outcome: known ? '' : result.outcome,
    verification: result.verification,
    source: result.source,
  };
}

export function roundsFrom(match: AdminMatch | null): RoundValues[] {
  return (match?.rounds ?? []).map((round) => ({
    key: newRoundKey(),
    mapName: text(round.mapName),
    mode: text(round.mode),
    side: text(round.side),
    scoreValkyria: numberText(round.scoreValkyria),
    scoreOpponent: numberText(round.scoreOpponent),
    outcome: round.outcome ?? '',
  }));
}

const mediaId = (value: MediaRef | null) => value?.assetId.toLowerCase() ?? null;

function vodsEqual(a: VodLinkValues[], b: VodLinkValues[]) {
  return a.length === b.length && a.every((link, index) => link.label === b[index]!.label && link.url === b[index]!.url);
}

export function factsEqual(a: FactsValues, b: FactsValues): boolean {
  return (
    a.game === b.game &&
    a.opponentName === b.opponentName &&
    a.opponentShortCode === b.opponentShortCode &&
    mediaId(a.opponentLogo) === mediaId(b.opponentLogo) &&
    a.competitionType === b.competitionType &&
    a.competitionName === b.competitionName &&
    a.tournamentId === b.tournamentId &&
    a.season === b.season &&
    a.format === b.format &&
    a.bestOf === b.bestOf &&
    a.teamSize === b.teamSize &&
    a.eventUrl === b.eventUrl &&
    a.leagueMatchUrl === b.leagueMatchUrl &&
    vodsEqual(a.vodLinks, b.vodLinks) &&
    mediaId(a.cover) === mediaId(b.cover) &&
    a.internalNotes === b.internalNotes &&
    a.slug === b.slug
  );
}

function factValue(values: FactsValues, key: keyof FactsValues): unknown {
  const value = values[key];
  if (key === 'vodLinks') return (value as VodLinkValues[]).map((link) => [link.label, link.url]);
  if (key === 'opponentLogo' || key === 'cover') return (value as MediaRef | null)?.assetId.toLowerCase() ?? null;
  return value;
}

/**
 * Three-way merge after loading a newer server version: fields the user did not touch
 * (still equal to the old base) take the newer server value; edited fields keep the
 * user's value. Nobody else's change is silently reverted by a later save.
 */
export function mergeFacts(user: FactsValues, oldBase: FactsValues, fresh: FactsValues): FactsValues {
  const merged = { ...fresh };
  for (const key of Object.keys(fresh) as (keyof FactsValues)[]) {
    if (JSON.stringify(factValue(user, key)) !== JSON.stringify(factValue(oldBase, key))) (merged as Record<string, unknown>)[key] = user[key];
  }
  return merged;
}

export function mergeFlat<T extends Record<string, unknown>>(user: T, oldBase: T, fresh: T): T {
  const merged = { ...fresh };
  for (const key of Object.keys(fresh) as (keyof T)[]) if (user[key] !== oldBase[key]) merged[key] = user[key];
  return merged;
}

export function roundsEqual(a: RoundValues[], b: RoundValues[]): boolean {
  const fields = ['mapName', 'mode', 'side', 'scoreValkyria', 'scoreOpponent', 'outcome'] as const;
  return a.length === b.length && a.every((round, index) => fields.every((field) => round[field] === b[index]![field]));
}

export function scheduleEqual(a: ScheduleValues, b: ScheduleValues): boolean {
  return a.date === b.date && a.time === b.time && a.timeZone === b.timeZone;
}

export function resultEqual(a: ResultValues, b: ResultValues): boolean {
  return a.scoreValkyria === b.scoreValkyria && a.scoreOpponent === b.scoreOpponent && a.outcome === b.outcome && a.verification === b.verification && a.source === b.source;
}

/** `''` → null, digits → number, anything else → Number.NaN (reported as `invalid_number`). */
export function parseCount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return /^\d{1,7}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

const optionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export function outcomeForScores(valkyria: number, opponent: number): Exclude<MatchOutcome, 'unknown'> {
  if (valkyria > opponent) return 'win';
  if (valkyria < opponent) return 'loss';
  return 'draw';
}

export type ResolvedSchedule = { ok: true; instant: Date; localDateTime: string } | { ok: false; code: string };

/** Resolves the wall-clock start in its explicit zone (rejecting DST-gap times). */
export function resolveSchedule(values: ScheduleValues): ResolvedSchedule {
  if (!values.date || !values.time) return { ok: false, code: 'required' };
  if (!isValidTimeZone(values.timeZone)) return { ok: false, code: 'invalid_time_zone' };
  const localDateTime = `${values.date}T${values.time.slice(0, 5)}`;
  try {
    return { ok: true, instant: zonedLocalToInstant(localDateTime, values.timeZone), localDateTime };
  } catch (error) {
    return { ok: false, code: error instanceof ZonedTimeError ? error.code : 'invalid_local_time' };
  }
}

function vodInput(links: VodLinkValues[]) {
  return links.filter((link) => link.label.trim() !== '' || link.url.trim() !== '').map((link) => ({ label: link.label.trim(), url: link.url.trim() }));
}

export function roundsInput(rounds: RoundValues[]) {
  return rounds.map((round) => ({
    mapName: optionalText(round.mapName),
    mode: optionalText(round.mode),
    side: optionalText(round.side),
    scoreValkyria: parseCount(round.scoreValkyria),
    scoreOpponent: parseCount(round.scoreOpponent),
    outcome: round.outcome === '' ? null : round.outcome,
  }));
}

/** `https:` URL without credentials (mirrors the server's `httpsUrlSchema`). */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Client checks for the facts group (server validation remains authoritative). */
export function validateFacts(values: FactsValues): FieldErrors {
  const errors: FieldErrors = {};
  if (values.opponentName.trim() === '') errors.opponentName = 'required';
  if (values.eventUrl.trim() !== '' && !isHttpsUrl(values.eventUrl)) errors.eventUrl = 'invalid_format';
  if (values.leagueMatchUrl.trim() !== '') {
    if (values.game !== 'wardogs') errors.leagueMatchUrl = 'wardogs_only';
    else if (values.leagueMatchUrl.trim().length > LEAGUE_MATCH_URL_MAX_LENGTH || !isLeagueMatchUrl(values.leagueMatchUrl)) errors.leagueMatchUrl = 'invalid_league_url';
  }
  for (const field of ['bestOf', 'teamSize'] as const) {
    const parsed = parseCount(values[field]);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 1)) errors[field] = 'invalid_number';
  }
  values.vodLinks.forEach((link, index) => {
    const blank = link.label.trim() === '' && link.url.trim() === '';
    if (blank) return;
    if (link.label.trim() === '') errors[`vodLinks.${index}.label`] = 'required';
    if (link.url.trim() === '') errors[`vodLinks.${index}.url`] = 'required';
    else if (!isHttpsUrl(link.url)) errors[`vodLinks.${index}.url`] = 'invalid_format';
  });
  return errors;
}

export function validateRounds(rounds: RoundValues[], game?: Game): FieldErrors {
  const errors: FieldErrors = {};
  if (game) {
    const parsed = rounds.map((round) => {
      const v = parseCount(round.scoreValkyria);
      const o = parseCount(round.scoreOpponent);
      return { side: round.side.trim() || null, scoreValkyria: Number.isNaN(v) ? null : v, scoreOpponent: Number.isNaN(o) ? null : o };
    });
    Object.assign(errors, roundIssuesForGame(game, parsed));
  }
  rounds.forEach((round, index) => {
    for (const field of ['scoreValkyria', 'scoreOpponent'] as const) {
      if (Number.isNaN(parseCount(round[field]))) errors[`rounds.${index}.${field}`] = 'invalid_number';
    }
    const v = parseCount(round.scoreValkyria);
    const o = parseCount(round.scoreOpponent);
    if (v !== null && o !== null && !Number.isNaN(v) && !Number.isNaN(o) && round.outcome !== '' && round.outcome !== 'unknown' && round.outcome !== outcomeForScores(v, o)) {
      errors[`rounds.${index}.outcome`] = 'outcome_inconsistent';
    }
  });
  return errors;
}

export function validateResult(values: ResultValues): FieldErrors {
  const errors: FieldErrors = {};
  const v = parseCount(values.scoreValkyria);
  const o = parseCount(values.scoreOpponent);
  if (Number.isNaN(v)) errors.scoreValkyria = 'invalid_number';
  if (Number.isNaN(o)) errors.scoreOpponent = 'invalid_number';
  if (errors.scoreValkyria || errors.scoreOpponent) return errors;
  if ((v === null) !== (o === null)) {
    errors[v === null ? 'scoreValkyria' : 'scoreOpponent'] = 'scores_both_or_neither';
    return errors;
  }
  if (v !== null && o !== null && values.outcome !== '' && values.outcome !== outcomeForScores(v, o)) errors.outcome = 'outcome_inconsistent';
  if (values.verification === 'verified' && v === null && (values.outcome === '' || values.outcome === 'unknown')) errors.verification = 'verified_requires_result';
  return errors;
}

/** Shared facts payload (create and update use the same field names). */
function factsPayload(values: FactsValues) {
  return {
    game: values.game,
    opponentName: values.opponentName.trim(),
    opponentShortCode: optionalText(values.opponentShortCode),
    opponentLogoAssetId: values.opponentLogo?.assetId ?? null,
    competitionType: values.competitionType,
    competitionName: optionalText(values.competitionName),
    tournamentId: values.tournamentId || null,
    season: optionalText(values.season),
    format: optionalText(values.format),
    bestOf: parseCount(values.bestOf),
    teamSize: parseCount(values.teamSize),
    eventUrl: optionalText(values.eventUrl),
    leagueMatchUrl: optionalText(values.leagueMatchUrl),
    vodLinks: vodInput(values.vodLinks),
    coverAssetId: values.cover?.assetId ?? null,
    internalNotes: values.internalNotes,
  };
}

export function buildCreateInput(values: FactsValues, schedule: ScheduleValues, localDateTime: string) {
  const slug = values.slug.trim();
  return {
    ...factsPayload(values),
    ...(slug ? { slug } : {}),
    startsAt: { localDateTime, timeZone: schedule.timeZone },
    timeZone: schedule.timeZone,
  };
}

/** Only changed fields are sent, so the audit log lists exactly what was edited. */
export function buildUpdatePatch(values: FactsValues, baseline: FactsValues) {
  const next = factsPayload(values);
  const previous = factsPayload(baseline);
  const patch: Partial<ReturnType<typeof factsPayload>> = {};
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(previous[key])) (patch as Record<string, unknown>)[key] = next[key];
  }
  return patch;
}

export function buildResultInput(values: ResultValues) {
  const scoreValkyria = parseCount(values.scoreValkyria);
  const scoreOpponent = parseCount(values.scoreOpponent);
  const known = scoreValkyria !== null && scoreOpponent !== null;
  return {
    scoreValkyria,
    scoreOpponent,
    // Omitted → derived from known scores (or `unknown`); an explicit choice is checked server-side.
    ...(values.outcome !== '' ? { outcome: values.outcome } : known ? {} : { outcome: 'unknown' as const }),
    verification: values.verification,
    source: values.source.trim(),
  };
}

/** Transitions allowed per status (mirrors the service rules for button availability). */
export function allowedTransitions(status: MatchStatus) {
  return {
    postpone: status === 'scheduled' || status === 'live' || status === 'postponed',
    reschedule: status === 'scheduled' || status === 'postponed',
    cancel: status === 'scheduled' || status === 'live' || status === 'postponed',
    live: status === 'scheduled' || status === 'postponed',
    result: status !== 'cancelled',
  };
}
