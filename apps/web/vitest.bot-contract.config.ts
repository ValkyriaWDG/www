import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
// Global setup drops disposable templates/workers, so reject unsafe targets before it runs.
const database = new URL(process.env.DATABASE_URL ?? 'invalid');
if (!['postgres:', 'postgresql:'].includes(database.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || !/^\/[a-z][a-z0-9_]{0,35}test[a-z0-9_]{0,8}$/.test(database.pathname)) throw new Error('Bot contract tests require a disposable loopback database with a bounded test name.');
/** Explicit joint-repository suite; absence of the pinned bot checkout is an error. */
export default defineConfig({ ...base, test: { projects: [{ extends: true, test: { name: 'bot-contract', include: ['tests/contract/bot-management.test.ts'], globalSetup: ['tests/integration/global-setup.ts'], testTimeout: 20_000, hookTimeout: 90_000 } }] } });
