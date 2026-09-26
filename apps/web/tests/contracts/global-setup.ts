import type { TestProject } from 'vitest/node';
import integrationSetup from '../integration/global-setup';

/** Check the destructive test fixture target before the common setup connects. */
export default async function setup(project: TestProject) {
  const url = new URL(process.env.DATABASE_URL ?? 'invalid:');
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !/^\/[a-z][a-z0-9_]*_test$/.test(url.pathname)
    || url.search || url.hash) {
    throw new Error('Role-sync contract tests require a loopback disposable PostgreSQL database ending in _test.');
  }
  return integrationSetup(project);
}
