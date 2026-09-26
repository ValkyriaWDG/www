/**
 * The browser suite uses its own disposable database derived from DATABASE_URL
 * (`<name>_e2e`) so it never touches development data.
 */
export function e2eDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL (or E2E_DATABASE_URL) must point to a disposable PostgreSQL server for e2e tests.');
  const url = new URL(base);
  url.pathname = `/${url.pathname.slice(1) || 'valkyria'}_e2e`;
  return url.toString();
}
