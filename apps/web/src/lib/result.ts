import { AccessDeniedError, type AccessDeniedCode } from '@/modules/access/types';

/**
 * Stable English machine codes for domain failures. The UI maps each code to a localized
 * message (`common.errors.<code>`); raw provider/database errors never reach the client.
 */
export type DomainErrorCode =
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'slug_taken'
  | 'invalid_state'
  | 'rate_limited'
  | 'payload_too_large'
  | 'unsupported_media'
  | 'in_use'
  | 'unavailable';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly fieldErrors: Record<string, string> | undefined;
  constructor(code: DomainErrorCode, message?: string, fieldErrors?: Record<string, string>) {
    super(message ?? code);
    this.name = 'DomainError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export type ErrorCode = DomainErrorCode | AccessDeniedCode | 'unexpected';

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; fieldErrors?: Record<string, string> };

/** Converts a thrown error into a safe action result; unexpected errors are logged server-side only. */
export function toActionError(error: unknown, context = 'action'): Extract<ActionResult, { ok: false }> {
  if (error instanceof DomainError) {
    return error.fieldErrors ? { ok: false, code: error.code, fieldErrors: error.fieldErrors } : { ok: false, code: error.code };
  }
  if (error instanceof AccessDeniedError) return { ok: false, code: error.code };
  console.error(`[${context}] unexpected failure: ${error instanceof Error ? error.name : 'unknown'}`);
  return { ok: false, code: 'unexpected' };
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
