import { createDb, redactConnectionDetails } from '@valkyria/db';
import { pgErrorInfo } from '@/modules/content/db-errors';
import { runPublisher } from '@/modules/content/publisher';

/**
 * Scheduled-publication runner (`pnpm publish:due`, bundled in the image as
 * `scripts/publish-due.mjs`). Runs ONE pass per invocation; an operator-owned timer
 * (e.g. a systemd timer every minute with overlap protection) invokes it. The pass is
 * transactionally idempotent, so overlapping runs cannot double-publish.
 *
 * Identity: audit events are attributed to the `scheduler` service identity; every
 * intent is re-authorized against its issuer's CURRENT authority before publication.
 * Exit codes: 0 completed pass (individual intents may be blocked/failed — see the
 * summary and audit log), 1 infrastructure failure, 2 missing configuration.
 */
async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required.');
    return 2;
  }
  const handle = createDb(url, { max: 2, statementTimeoutMs: 30_000, applicationName: 'valkyria-publisher' });
  try {
    const summary = await runPublisher(handle.db, { log: (line) => console.log(`[publisher] ${line}`) });
    console.log(JSON.stringify({ event: 'publisher.run', ...summary }));
    return 0;
  } catch (error) {
    // Query text/parameters are never printed; only the error class and SQLSTATE.
    const code = pgErrorInfo(error)?.code ?? 'n/a';
    const name = error instanceof Error ? redactConnectionDetails(error.name) : 'unknown';
    console.error(`[publisher] run failed: ${name} (sqlstate ${code})`);
    return 1;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

main().then(
  (code) => process.exit(code),
  () => process.exit(1),
);
