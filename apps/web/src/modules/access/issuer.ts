import type { Executor } from '@valkyria/db';
import type { Capability } from './capabilities';

export type IssuerCheck = {
  issuerKind: 'discord' | 'local_admin';
  issuerUserId: string | null;
  /** Local-admin delegation identity/version recorded when the schedule was created. */
  grantId: string | null;
  grantVersion: number | null;
  capability: Capability;
};

/**
 * `authorized`: the issuer currently holds the capability (fresh Discord snapshot or the
 * unchanged, active local grant). `revoked`: authority is definitely gone/changed.
 * `unknown`: authority could not be verified (e.g. Discord unavailable). Callers treat
 * anything but `authorized` as blocked — never as permission.
 */
export type IssuerVerdict = 'authorized' | 'revoked' | 'unknown';

export type IssuerDeps = { now?: () => Date; fetchImpl?: typeof fetch };

/**
 * CONTRACT (implemented by the auth slice): re-verify a scheduled publication issuer's
 * authority at execution time without any stored/replayed session or MFA credential.
 * Until implemented this fails closed.
 */
export async function verifyIssuerAuthority(_db: Executor, _input: IssuerCheck, _deps: IssuerDeps = {}): Promise<IssuerVerdict> {
  return 'unknown';
}
