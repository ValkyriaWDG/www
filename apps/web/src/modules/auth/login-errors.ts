/** Localized message keys (under `auth.login.errors`) for sign-in failure states. */
export type LoginErrorKey = 'cancelled' | 'invalid' | 'restricted' | 'rateLimited' | 'unavailable' | 'generic';

const CANCELLED = new Set(['access_denied', 'consent_required', 'interaction_required', 'login_required']);
const INVALID = new Set([
  'state_mismatch',
  'state_not_found',
  'state_invalid',
  'state_security_mismatch',
  'state_generation_error',
  'invalid_callback_request',
  'no_code',
  'invalid_code',
  'invalid_grant',
  'please_restart_the_process',
  'no_callback_url',
  'issuer_mismatch',
  'issuer_missing',
  'nonce_binding_missing',
]);
const RESTRICTED = new Set([
  'account_not_linked',
  'unable_to_link_account',
  'unable_to_create_session',
  'unable_to_create_user',
  'signup_disabled',
  'account_already_linked_to_different_user',
  'email_does_not_match',
  'email_not_verified',
  'email_not_found',
]);
const UNAVAILABLE = new Set(['unavailable', 'provider_unavailable', 'unable_to_get_user_info', 'oauth_provider_not_found', 'internal_server_error', 'temporarily_unavailable', 'server_error']);

/**
 * Maps an untrusted `?error=` value (Better Auth callback code, provider error or our own
 * code) to a localized message key. The raw value and any `error_description` are never
 * rendered.
 */
export function loginErrorKey(value: string | string[] | undefined | null): LoginErrorKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const code = raw.trim().toLowerCase().replace(/[\s-]+/g, '_').slice(0, 64);
  if (CANCELLED.has(code)) return 'cancelled';
  if (INVALID.has(code)) return 'invalid';
  if (RESTRICTED.has(code)) return 'restricted';
  if (code === 'rate_limited' || code === 'too_many_requests') return 'rateLimited';
  if (UNAVAILABLE.has(code)) return 'unavailable';
  return 'generic';
}
