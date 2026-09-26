import type { MatchOutcome, MatchStatus, ResultVerification } from '@valkyria/db/schema';
import type { StatusKind } from '@/components/ui/panels';
import { DISPLAY_TIME_ZONE, FORMAT_LOCALE, type AppLocale } from '@/i18n/routing';
import type { MatchView } from './query';

/**
 * Pure presentation rules for public matches. An unknown score is never turned into a
 * number: callers render an explicit dash with an accessible explanation, never `0:0`.
 */

/** Public list a status belongs to (independent of publication; mirrors `VIEW_STATUSES`). */
export function viewForStatus(status: MatchStatus): MatchView {
  return status === 'completed' || status === 'cancelled' ? 'results' : 'upcoming';
}

type ResultInput = {
  status: MatchStatus;
  result: { scoreValkyria: number | null; scoreOpponent: number | null; outcome: MatchOutcome; verification: ResultVerification } | null;
};

export type ResultDescription =
  /** Both scores published. */
  | { kind: 'score'; valkyria: number; opponent: number; outcome: MatchOutcome; verification: ResultVerification }
  /** Outcome published without numeric scores. */
  | { kind: 'outcome'; outcome: Exclude<MatchOutcome, 'unknown'>; verification: ResultVerification }
  /** Completed, but no result has been published yet. */
  | { kind: 'unpublished' }
  /** Cancelled fixtures have no result and never count as a win or loss. */
  | { kind: 'cancelled' }
  /** Scheduled, live or postponed: not played yet. */
  | { kind: 'pending' };

const isScore = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

export function describeResult(match: ResultInput): ResultDescription {
  if (match.status === 'cancelled') return { kind: 'cancelled' };
  if (match.status !== 'completed') return { kind: 'pending' };
  const result = match.result;
  if (!result) return { kind: 'unpublished' };
  if (isScore(result.scoreValkyria) && isScore(result.scoreOpponent)) {
    return { kind: 'score', valkyria: result.scoreValkyria, opponent: result.scoreOpponent, outcome: result.outcome, verification: result.verification };
  }
  if (result.outcome !== 'unknown') return { kind: 'outcome', outcome: result.outcome, verification: result.verification };
  return { kind: 'unpublished' };
}

/** `2 : 1` for two known scores; `null` whenever either side is unknown. */
export function formatScore(valkyria: number | null | undefined, opponent: number | null | undefined): string | null {
  if (!isScore(valkyria) || !isScore(opponent)) return null;
  return `${valkyria} : ${opponent}`;
}

/** Badge tone for a match status; the label text always carries the meaning. */
export function statusKind(status: MatchStatus): StatusKind {
  switch (status) {
    case 'scheduled':
      return 'info';
    case 'live':
      return 'accent';
    case 'postponed':
      return 'warning';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
  }
}

export function outcomeKind(outcome: MatchOutcome): StatusKind {
  switch (outcome) {
    case 'win':
      return 'success';
    case 'loss':
      return 'danger';
    case 'draw':
      return 'neutral';
    default:
      return 'neutral';
  }
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Short zone name of an instant in the display zone for the UI locale's regional
 * conventions (`SEČ`/`SELČ` in cs-CZ, `CET`/`CEST` in en-GB), so DST is explicit per row.
 */
export function zoneName(value: Date | string, locale: AppLocale, timeZone: string = DISPLAY_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const key = `${locale}|${timeZone}`;
  let formatter = zoneFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(FORMAT_LOCALE[locale], { timeZone, timeZoneName: 'short' });
    zoneFormatters.set(key, formatter);
  }
  return formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? '';
}
