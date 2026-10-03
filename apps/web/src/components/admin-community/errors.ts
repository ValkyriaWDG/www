/**
 * Stable field-error codes produced by the community domain schemas (custom codes and
 * zod issue codes) plus a few client-side checks. Each has a localized message under
 * `adminCommunity.fieldErrors.<code>`; anything unknown maps to `invalid`, so raw
 * validator text (e.g. rich-text parser issues) is never shown to the user.
 */
export const FIELD_ERROR_CODES = [
  'required',
  'too_long',
  'too_small',
  'too_big',
  'invalid_type',
  'invalid_format',
  'invalid_value',
  'invalid_union',
  'invalid_number',
  'control_characters',
  'credentials_not_allowed',
  'invalid_time_zone',
  'invalid_local_time',
  'nonexistent_local_time',
  'out_of_range',
  'not_started',
  'invalid_slug',
  'slug_taken',
  'invalid_short_code',
  'duplicate_ordinal',
  'outcome_inconsistent',
  'scores_both_or_neither',
  'verified_requires_result',
  'scores_require_completed',
  'hll_side',
  'hll_sector_score',
  'invalid_scoreboard',
  'unknown_server',
  'hll_only',
  'wardogs_only',
  'invalid_league_url',
  'ends_before_start',
  'has_matches',
  'game_mismatch',
  'tournament_missing',
  'cancelled',
  'asset_unavailable',
  'alt_required',
  'consent_required',
  'consent_checkbox_required',
  'https_required',
  'discord_invite_required',
  'origin_not_allowed',
  'provenance_required',
  'duplicate_url',
  'duplicates',
  'unknown_setting',
  'conflict',
  'invalid_content',
  'invalid',
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

const KNOWN = new Set<string>(FIELD_ERROR_CODES);

export function fieldErrorCode(code: string | null | undefined): FieldErrorCode | null {
  if (!code) return null;
  return KNOWN.has(code) ? (code as FieldErrorCode) : 'invalid';
}

export type FieldErrors = Record<string, string>;

/** First error whose key equals `key` or is nested below it (`vodLinks.0.url` under `vodLinks`). */
export function errorFor(errors: FieldErrors, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (errors[key]) return errors[key];
  }
  return undefined;
}

export function errorsBelow(errors: FieldErrors, prefix: string): string | undefined {
  const match = Object.entries(errors).find(([key]) => key === prefix || key.startsWith(`${prefix}.`));
  return match?.[1];
}
