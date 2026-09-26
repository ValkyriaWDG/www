import { createDb, redactConnectionDetails } from '@valkyria/db';
import { runSeed } from '../seed/index';

/**
 * Idempotent production seed (`pnpm db:seed`, bundled as `scripts/seed.mjs`): reviewed
 * core pages in Czech and English plus news categories, inserted only when missing.
 * Prints each inserted/skipped item and exits non-zero on failure.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required.');
    process.exit(2);
  }
  const handle = createDb(url, { max: 2, applicationName: 'valkyria-seed' });
  try {
    const report = await runSeed(handle.db);
    for (const item of report.inserted) console.log(`inserted: ${item}`);
    for (const item of report.skipped) console.log(`skipped:  ${item}`);
    console.log(`Seed complete: ${report.inserted.length} inserted, ${report.skipped.length} skipped.`);
  } finally {
    await handle.close();
  }
}

/** Driver errors are wrapped by Drizzle (`cause`); report the underlying first line only. */
function describe(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return cause instanceof Error ? (cause.message.split('\n')[0] ?? cause.name) : 'unknown error';
}

main().catch((error: unknown) => {
  const message = describe(error);
  console.error(`Seed failed: ${redactConnectionDetails(message)}`);
  process.exit(1);
});
