import type { SessionAssurance } from '@/modules/access/types';

/** The subset of Better Auth's endpoint context the assurance decision reads. */
export type AssuranceContext = {
  path?: string | undefined;
  params?: Record<string, string | undefined> | undefined;
  context?: { session?: { session?: unknown } | null } | undefined;
} | null;

export const DISCORD_CALLBACK_PATH = '/callback/:id';
export const CREDENTIAL_SIGN_IN_PATH = '/sign-in/email';
export const SECOND_FACTOR_PATHS: ReadonlySet<string> = new Set(['/two-factor/verify-totp', '/two-factor/verify-backup-code']);

/**
 * Derives how a new session was established from the Better Auth endpoint that creates it:
 * - Discord OAuth callback → `discord`;
 * - Logi OIDC callback → `logi` (the session hook additionally requires a verified binding);
 * - credential sign-in (`/sign-in/email`, before any second factor) → `password`;
 * - TOTP/backup-code verification of a pending sign-in challenge → `mfa`;
 * - a second-factor verification inside an existing session (TOTP enrollment) keeps the
 *   restricted `password` assurance: MFA assurance only comes from a fresh sign-in challenge;
 * - anything else (2FA disable, internal calls, unknown paths) → `unknown`.
 */
export function assuranceForEndpoint(ctx: AssuranceContext): SessionAssurance {
  const path = ctx?.path;
  if (path === DISCORD_CALLBACK_PATH) return ctx?.params?.id === 'discord' ? 'discord' : ctx?.params?.id === 'logi' ? 'logi' : 'unknown';
  if (path === CREDENTIAL_SIGN_IN_PATH) return 'password';
  if (path && SECOND_FACTOR_PATHS.has(path)) return ctx?.context?.session?.session ? 'password' : 'mfa';
  return 'unknown';
}
