import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createDb } from '@valkyria/db';
import { importLegacyBundle } from '../modules/legacy/import-bundle';

async function main() {
  const { values } = parseArgs({ options: {
    bundle: { type: 'string' }, report: { type: 'string' }, apply: { type: 'boolean', default: false },
    publish: { type: 'boolean', default: false }, 'adopt-seed': { type: 'boolean', default: false },
    'repair-match-metadata': { type: 'boolean', default: false }, 'repair-editorial-metadata': { type: 'boolean', default: false },
    'editorial-supplement': { type: 'string' }, 'expected-supplement-sha256': { type: 'string' },
    'expected-sha256': { type: 'string' }, 'match-clock': { type: 'string', default: 'legacy-fixed-offset' },
  } });
  if (!values.bundle || !values.report || !process.env.DATABASE_URL) throw new Error('Required: --bundle, --report and DATABASE_URL');
  if (values['match-clock'] !== 'legacy-fixed-offset' && values['match-clock'] !== 'europe-prague') throw new Error('Invalid --match-clock');
  if ((values['repair-match-metadata'] || values['repair-editorial-metadata']) && (values.publish || values['adopt-seed'])) throw new Error('Invalid --publish/--adopt-seed with metadata repair');
  if (values['editorial-supplement'] && !values['repair-editorial-metadata']) throw new Error('Invalid --editorial-supplement without --repair-editorial-metadata');
  const file = path.resolve(values.bundle);
  if ((await stat(file)).size > 32 * 1024 * 1024) throw new Error('Bundle exceeds 32 MiB');
  const bytes = await readFile(file);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (values.apply && values['expected-sha256'] !== hash) throw new Error('--apply requires the reviewed bundle --expected-sha256');
  let editorialSupplement: unknown;
  let editorialSupplementRoot: string | undefined;
  let supplementSha256: string | undefined;
  if (values['editorial-supplement']) {
    const supplementFile = path.resolve(values['editorial-supplement']);
    if ((await stat(supplementFile)).size > 2 * 1024 * 1024) throw new Error('Bundle exceeds 2 MiB supplement limit');
    const supplementBytes = await readFile(supplementFile);
    supplementSha256 = createHash('sha256').update(supplementBytes).digest('hex');
    if (values.apply && values['expected-supplement-sha256'] !== supplementSha256) throw new Error('--apply requires the reviewed supplement --expected-supplement-sha256');
    editorialSupplement = JSON.parse(supplementBytes.toString('utf8'));
    editorialSupplementRoot = path.dirname(supplementFile);
  }
  const handle = createDb(process.env.DATABASE_URL, { max: 2, applicationName: 'valkyria-legacy-hll-import' });
  try {
    const result = await importLegacyBundle(handle.db, JSON.parse(bytes.toString('utf8')), path.dirname(file), {
      apply: values.apply, publish: values.publish, adoptSeed: values['adopt-seed'], matchClock: values['match-clock'],
      repairMatchMetadata: values['repair-match-metadata'], repairEditorialMetadata: values['repair-editorial-metadata'], editorialSupplement, editorialSupplementRoot,
    });
    await writeFile(path.resolve(values.report), `${JSON.stringify({ bundleSha256: hash, supplementSha256, ...result }, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ bundleSha256: hash, apply: result.apply, counts: result.counts }));
    if (result.items.some((item) => item.action === 'invalid' || item.action === 'conflict')) process.exitCode = 1;
  } finally { await handle.close(); }
}

main().catch((error: unknown) => {
  // CLI inputs and database/source errors may include confidential values. Report details privately through the dry-run report.
  console.error(error instanceof Error && /^(Required:|Invalid --|Bundle exceeds|--apply requires)/.test(error.message) ? error.message : 'Legacy migration failed validation or storage; no raw source/error payload was logged.');
  process.exitCode = 1;
});
