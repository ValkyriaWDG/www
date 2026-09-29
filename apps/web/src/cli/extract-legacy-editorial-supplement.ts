import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractEditorialSupplement } from '../modules/legacy/extract-editorial-supplement';
import { sourceHash } from '../modules/legacy/import-contract';

function required(flag: string) { const index = process.argv.indexOf(flag); const value = index >= 0 ? process.argv[index + 1] : null; if (!value || value.startsWith('--')) throw new Error(`${flag} required`); return path.resolve(value); }
async function main() {
  const source = required('--source'); const output = required('--output'); const bundlePath = required('--bundle');
  const bundle = JSON.parse((await readFile(bundlePath, 'utf8')).replace(/^\uFEFF/, '')) as { sourceRevision: string };
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  if (revision !== bundle.sourceRevision) throw new Error('Source revision differs from frozen bundle');
  const supplement = await extractEditorialSupplement(bundle, source, output);
  const serialized = JSON.stringify(supplement, null, 2) + '\n';
  const target = path.join(output, 'supplement.json');
  await writeFile(target, serialized, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST' || await readFile(target, 'utf8') !== serialized) throw error;
  });
  console.log(JSON.stringify({ documents: supplement.documents.length, stagedMedia: supplement.media.length, bundleSha256: supplement.bundleSha256, supplementSha256: sourceHash(supplement) }));
}
main().catch(() => { console.error('Editorial supplement extraction failed; inspect the local inputs without publishing raw source content.'); process.exitCode = 1; });
