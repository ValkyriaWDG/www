import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locates the reviewed SQL migrations: `MIGRATIONS_DIR`, then a `migrations` folder next
 * to a bundled script (container: /app/migrations), then the workspace package.
 */
export function resolveMigrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve(here, '../migrations'),
    path.resolve(here, '../../../../packages/db/drizzle'),
    path.resolve(process.cwd(), '../../packages/db/drizzle'),
    path.resolve(process.cwd(), 'packages/db/drizzle'),
  ].filter((value): value is string => Boolean(value));
  const found = candidates.find((candidate) => existsSync(path.join(candidate, 'meta', '_journal.json')));
  if (!found) throw new Error('Migration folder not found; set MIGRATIONS_DIR.');
  return found;
}
