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


/**
 * Database guard for session updates. Assurance and the upstream binding are immutable
 * after creation (`false` rejects the update). Better Auth's sliding refresh would extend
 * a Logi session to the full website TTL; it keeps the expiry set at sign-in instead, so
 * the session never outlives the Logi authority it was created with. The refresh runs in
 * `getSession`, which exposes the session being refreshed on the endpoint context.
 */
export function guardSessionUpdate<T extends Record<string, unknown> & { expiresAt?: Date | string | undefined }>(data: T, ctx: AssuranceContext): false | { data: T } | undefined {
  if (Object.keys(data).some((key) => key === 'assurance' || key.startsWith('logi'))) return false;
  if (!('expiresAt' in data)) return undefined;
  const current = ctx?.context?.session?.session as { assurance?: unknown; expiresAt?: unknown } | undefined;
  if (current?.assurance !== 'logi') return undefined;
  const cap = current.expiresAt instanceof Date || typeof current.expiresAt === 'string' ? new Date(current.expiresAt) : null;
  // Without the original expiry the extension cannot be bounded; keep the stored value.
  if (!cap || !Number.isFinite(cap.getTime())) {
    const rest = { ...data };
    delete rest.expiresAt;
    return { data: rest };
  }
  const requested = data.expiresAt instanceof Date || typeof data.expiresAt === 'string' ? new Date(data.expiresAt) : null;
  return { data: { ...data, expiresAt: requested && Number.isFinite(requested.getTime()) && requested < cap ? requested : cap } as T };
}
