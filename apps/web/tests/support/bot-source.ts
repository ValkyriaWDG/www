import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { build } from 'esbuild';

export const BOT_CONTRACT_REVISION = '4f3db011ec0aa96eaaa96bfb7b71cd4bffd804ac';

/** Compiles selected real bot exports against installed locked www test dependencies. */
export async function loadBotSource<T>(exports: Record<string, string>): Promise<{
  api: T; sourceDirectory: string; sourceRevision: string; cleanup(): Promise<void>;
}> {
  const source = process.env.BOT_SOURCE_DIR;
  if (!source) throw new Error('BOT_SOURCE_DIR must name the pinned public bot checkout; cross-repo tests are never skipped.');
  const revision = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['-C', source, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  if (revision !== BOT_CONTRACT_REVISION || dirty) throw new Error('Bot source must be clean at BOT_CONTRACT_REVISION.');
  const directory = resolve('.local/bot-contract');
  await mkdir(directory, { recursive: true });
  const bundle = resolve(directory, `actual-bot-${randomUUID()}.cjs`);
  const contents = Object.entries(exports).map(([name, path]) => {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || !/^src\/[a-z/-]+\.ts$/.test(path)) throw new Error('Invalid test export.');
    return `export { ${name} } from ${JSON.stringify(resolve(source, path).replaceAll('\\', '/'))};`;
  }).join('\n');
  await build({ stdin: { contents, resolveDir: process.cwd(), sourcefile: 'actual-bot-exports.ts' }, outfile: bundle, bundle: true, platform: 'node', target: 'node24', format: 'cjs', packages: 'external', logLevel: 'silent' });
  return { api: createRequire(import.meta.url)(bundle) as T, sourceDirectory: source, sourceRevision: revision, cleanup: () => unlink(bundle) };
}
