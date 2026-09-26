/**
 * Synthetic fixtures are for development/test databases only. They load only when the
 * operator passes `--allow-fixtures` AND either NODE_ENV is not `production` or the target
 * database name ends with `_dev`, `_test` or `_e2e`.
 */

export const ALLOW_FIXTURES_FLAG = '--allow-fixtures';
const SAFE_DATABASE_NAME = /_(dev|test|e2e)$/;

export class FixtureGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixtureGuardError';
  }
}

export function databaseNameFromUrl(url: string | undefined): string {
  if (!url) throw new FixtureGuardError('DATABASE_URL is required.');
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new FixtureGuardError('DATABASE_URL is not a valid connection URL.');
  }
  if (!name) throw new FixtureGuardError('DATABASE_URL must name a database.');
  return name;
}

export function assertFixturesAllowed(input: { argv: readonly string[]; nodeEnv: string | undefined; databaseName: string }): void {
  if (!input.argv.includes(ALLOW_FIXTURES_FLAG)) {
    throw new FixtureGuardError(`Refusing to touch synthetic fixtures without ${ALLOW_FIXTURES_FLAG}.`);
  }
  if (input.nodeEnv === 'production' && !SAFE_DATABASE_NAME.test(input.databaseName)) {
    throw new FixtureGuardError('Refusing to touch synthetic fixtures in production unless the database name ends with _dev, _test or _e2e.');
  }
}
