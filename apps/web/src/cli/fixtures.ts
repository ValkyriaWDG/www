import { createDb, redactConnectionDetails } from '@valkyria/db';
import { loadFixtures, resetFixtures, resolveMediaRoot } from '../fixtures/index';
import { assertFixturesAllowed, databaseNameFromUrl, FixtureGuardError } from '../fixtures/guard';

/**
 * Synthetic development/test fixtures (`pnpm db:fixtures -- --allow-fixtures [--reset]`).
 * Refuses to run without `--allow-fixtures`, and under NODE_ENV=production unless the
 * database name ends with `_dev`, `_test` or `_e2e`. Default: replace the fixture set.
 * `--reset`: remove fixture data only (seeded and admin-created data stay).
 */
async function main() {
  const argv = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  const databaseName = databaseNameFromUrl(url);
  assertFixturesAllowed({ argv, nodeEnv: process.env.NODE_ENV, databaseName });

  const handle = createDb(url!, { max: 2, applicationName: 'valkyria-fixtures' });
  try {
    const [row] = (await handle.pool.query<{ name: string }>('select current_database() as name')).rows;
    if (row?.name !== databaseName) throw new FixtureGuardError('Connected database does not match DATABASE_URL.');
    const mediaRoot = resolveMediaRoot();
    if (argv.includes('--reset')) {
      const removed = await resetFixtures(handle.db, { mediaRoot });
      console.log(
        `Fixtures removed from ${databaseName}: ${removed.documents} documents, ${removed.matches} matches, ${removed.members} members, ${removed.tags} tags, ${removed.assets} assets.`,
      );
      return;
    }
    const report = await loadFixtures(handle.db, { mediaRoot });
    console.log(
      `Synthetic fixtures loaded into ${databaseName}: ${report.members} members, ${report.matches} matches, ${report.news} news documents (${report.newsTranslations} translations, ${report.schedules} schedule), ${report.prose} prose translations, ${report.assets} generated images in ${mediaRoot}.`,
    );
  } finally {
    await handle.close();
  }
}

function describe(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return cause instanceof Error ? (cause.message.split('\n')[0] ?? cause.name) : 'unknown error';
}

main().catch((error: unknown) => {
  console.error(`Fixtures failed: ${redactConnectionDetails(describe(error))}`);
  process.exit(error instanceof FixtureGuardError ? 2 : 1);
});
