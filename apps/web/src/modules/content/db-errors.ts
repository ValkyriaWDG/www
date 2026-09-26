/**
 * Helpers to inspect PostgreSQL errors through Drizzle's wrapper (`DrizzleQueryError`
 * keeps the driver error as `cause`). Never forward raw messages to clients.
 */
export type PgErrorInfo = { code: string; constraint: string | undefined };

export function pgErrorInfo(error: unknown): PgErrorInfo | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === 'object' && current !== null && 'code' in current && typeof (current as { code: unknown }).code === 'string') {
      const code = (current as { code: string }).code;
      if (/^[0-9A-Z]{5}$/.test(code)) {
        return { code, constraint: (current as { constraint?: string }).constraint };
      }
    }
    current = typeof current === 'object' && current !== null && 'cause' in current ? (current as { cause: unknown }).cause : undefined;
  }
  return null;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const info = pgErrorInfo(error);
  return info?.code === '23505' && (constraint === undefined || info.constraint === constraint);
}

/** Serialization failures, deadlocks, lock/statement timeouts and connection loss. */
export function isTransientDbError(error: unknown): boolean {
  const info = pgErrorInfo(error);
  if (!info) return false;
  return ['40001', '40P01', '55P03', '57014', '57P01', '57P02', '57P03', '53300'].includes(info.code) || info.code.startsWith('08');
}
