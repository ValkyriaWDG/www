import type { AppRole } from '@valkyria/db';
import type { Capability } from './capabilities';

/** How the current session was established (stored on the session by the auth module). */
export type SessionAssurance = 'discord' | 'password' | 'mfa' | 'unknown';

/** Read operations may use a role snapshot up to 5 minutes old; writes require ≤60 seconds. */
export type AccessIntent = 'read' | 'write';

/** State of the Discord-derived authorization used for this principal. */
export type AuthorizationStatus =
  | 'verified' // fresh snapshot (or valid local grant) for the requested intent
  | 'stale' // snapshot too old and refresh failed → privileged access denied
  | 'not_member' // not present in the configured guild (left/unknown)
  | 'unavailable' // Discord/guild not configured or unreachable → fail closed
  | 'mfa_required'; // local grant exists but session lacks credential + MFA assurance

export type Principal = {
  kind: 'principal';
  userId: string;
  /** Approved display label for audit/UI; never an email address. */
  label: string;
  source: 'discord' | 'local_admin';
  sessionId: string;
  assurance: SessionAssurance;
  intent: AccessIntent;
  status: AuthorizationStatus;
  roles: readonly AppRole[];
  capabilities: ReadonlySet<Capability>;
  /** Present only for a verified local-admin grant used from an MFA-assured session. */
  localGrant: { id: string; version: number } | null;
  /** When the authorization inputs (snapshot or grant) were verified. */
  verifiedAt: Date | null;
};

export type Actor =
  | { kind: 'anonymous' }
  | Principal
  /** Service identity for CLIs/runners; never derived from a browser request. */
  | { kind: 'system'; label: string; capabilities: ReadonlySet<Capability> };

/** Stable machine codes; the UI maps them to localized messages. */
export type AccessDeniedCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'stale_authorization'
  | 'verification_unavailable'
  | 'not_member'
  | 'mfa_required';

export class AccessDeniedError extends Error {
  readonly code: AccessDeniedCode;
  readonly capability: Capability | undefined;
  constructor(code: AccessDeniedCode, capability?: Capability) {
    super(`Access denied (${code}${capability ? `: ${capability}` : ''})`);
    this.name = 'AccessDeniedError';
    this.code = code;
    this.capability = capability;
  }
}
