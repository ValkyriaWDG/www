// Serves the production standalone build exactly as the container does (server.js),
// after placing static assets beside it. Used by Playwright's managed webServer.
import { spawn } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = process.env.NEXT_DIST_DIR || '.next';
const standaloneApp = path.join(appDir, distDir, 'standalone', 'apps', 'web');
const server = path.join(standaloneApp, 'server.js');
if (!existsSync(server)) {
  console.error(`Missing ${path.relative(appDir, server)}; run "pnpm build" first.`);
  process.exit(1);
}
cpSync(path.join(appDir, distDir, 'static'), path.join(standaloneApp, distDir, 'static'), { recursive: true });
if (existsSync(path.join(appDir, 'public'))) cpSync(path.join(appDir, 'public'), path.join(standaloneApp, 'public'), { recursive: true });

const child = spawn(process.execPath, [server], {
  cwd: standaloneApp,
  stdio: 'inherit',
  env: { ...process.env, HOSTNAME: process.env.HOSTNAME || '127.0.0.1', PORT: process.env.PORT || '3100' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
