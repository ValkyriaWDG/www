// Bundles the operational CLIs (migrate, seed, fixtures, publisher, local-admin
// provisioning) into self-contained ESM files for the container image. Native/runtime
// dependencies that exist in the standalone output stay external.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'dist', 'cli');
rmSync(path.join(root, 'dist'), { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const entries = readdirSync(path.join(root, 'src', 'cli'))
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'paths.ts')
  .map((file) => path.join(root, 'src', 'cli', file));

await build({
  entryPoints: entries,
  outdir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: false,
  legalComments: 'eof',
  tsconfig: path.join(root, 'tsconfig.json'),
  // CommonJS dependencies bundled into ESM need a require shim.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  alias: { 'server-only': path.join(root, 'tests', 'support', 'empty-module.ts') },
  external: ['sharp', 'pg-native'],
  logLevel: 'info',
});

const migrations = path.resolve(root, '../../packages/db/drizzle');
if (!existsSync(path.join(migrations, 'meta', '_journal.json'))) throw new Error('Missing migrations to bundle.');
cpSync(migrations, path.join(root, 'dist', 'migrations'), { recursive: true });
console.log(`Bundled ${entries.length} CLI(s) and migrations into dist/.`);
