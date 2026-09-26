import { runMigrations } from '@valkyria/db/migrate';
import { resolveMigrationsFolder } from './paths';

/**
 * Explicit migration runner (`pnpm db:migrate`, bundled in the image as
 * `scripts/migrate.mjs`). Never invoked automatically on application start.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required.');
    process.exit(2);
  }
  const migrationsFolder = resolveMigrationsFolder();
  const result = await runMigrations(url, { migrationsFolder, log: (message) => console.log(message) });
  console.log(`Applied ${result.applied.length} migration(s); ${result.alreadyApplied} already applied; ${result.total} total.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exit(1);
});
