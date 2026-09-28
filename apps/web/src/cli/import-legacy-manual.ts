import { createDb, redactConnectionDetails } from '@valkyria/db';
import { importLegacyManualDrafts, legacyGuideUrl } from '../modules/legacy/import-manual';
import { LEGACY_GUIDES } from '../modules/legacy/hll';

/**
 * Creates private Czech draft shells with provenance for the reviewed legacy HLL guides
 * (`pnpm --filter @valkyria/web exec tsx src/cli/import-legacy-manual.ts [--apply]`).
 * Without `--apply` it only reports what would be created. It never fetches the legacy
 * site, copies body text or publishes anything; editors add reviewed content.
 */
async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required.');
    process.exit(2);
  }
  const handle = createDb(url, { max: 2, applicationName: 'valkyria-legacy-manual-import' });
  try {
    const report = await importLegacyManualDrafts(handle.db, { dryRun: !apply });
    for (const item of report.created) console.log(`${apply ? 'created' : 'would create'}: ${item}`);
    for (const item of report.skipped) console.log(`skipped: ${item}`);
    console.log(`Legacy manual import ${apply ? 'complete' : 'dry run'}: ${report.created.length} ${apply ? 'created' : 'to create'}, ${report.skipped.length} skipped.`);
    if (!apply) console.log(`Sources: ${LEGACY_GUIDES.map(legacyGuideUrl).join(', ')}. Re-run with --apply to create the drafts.`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const message = cause instanceof Error ? (cause.message.split('\n')[0] ?? cause.name) : 'unknown error';
  console.error(`Legacy manual import failed: ${redactConnectionDetails(message)}`);
  process.exit(1);
});
